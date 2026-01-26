use anyhow::{anyhow, Result};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// Result of a virus scan
#[derive(Debug, Clone)]
pub enum ScanResult {
    /// File is clean (no threats detected)
    Clean,
    /// File is infected with malware
    Infected { threat_name: String },
    /// Scan could not be completed
    Error { reason: String },
}

/// Trait for virus scanning implementations
#[async_trait::async_trait]
pub trait VirusScanner: Send + Sync {
    /// Scan file content for malware
    async fn scan(&self, data: &[u8]) -> Result<ScanResult>;
    
    /// Check if the scanner is available/healthy
    async fn health_check(&self) -> bool;
}

/// ClamAV scanner using TCP socket (clamd)
/// 
/// Docker command to run ClamAV:
/// ```bash
/// docker run -d --name clamav -p 3310:3310 clamav/clamav:latest
/// ```
pub struct ClamAvScanner {
    host: String,
    port: u16,
}

impl ClamAvScanner {
    pub fn new(host: String, port: u16) -> Self {
        Self { host, port }
    }
    
    pub fn from_env() -> Self {
        let host = std::env::var("CLAMAV_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = std::env::var("CLAMAV_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3310);
        Self::new(host, port)
    }
    
    async fn connect(&self) -> Result<TcpStream> {
        let addr = format!("{}:{}", self.host, self.port);
        TcpStream::connect(&addr)
            .await
            .map_err(|e| anyhow!("Failed to connect to ClamAV at {}: {}", addr, e))
    }
}

#[async_trait::async_trait]
impl VirusScanner for ClamAvScanner {
    async fn scan(&self, data: &[u8]) -> Result<ScanResult> {
        let mut stream = self.connect().await?;
        
        // Use INSTREAM command for streaming data to clamd
        // Format: zINSTREAM\0 <length:u32 big-endian> <data> ... <0:u32>
        stream.write_all(b"zINSTREAM\0").await?;
        
        // Send data in chunks (max 2GB per chunk, but we'll use 10MB)
        const CHUNK_SIZE: usize = 10 * 1024 * 1024;
        
        for chunk in data.chunks(CHUNK_SIZE) {
            let len = (chunk.len() as u32).to_be_bytes();
            stream.write_all(&len).await?;
            stream.write_all(chunk).await?;
        }
        
        // Send zero-length chunk to indicate end of stream
        stream.write_all(&0u32.to_be_bytes()).await?;
        stream.flush().await?;
        
        // Read response
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await?;
        
        let response_str = String::from_utf8_lossy(&response);
        let response_str = response_str.trim_end_matches('\0').trim();
        
        tracing::debug!("ClamAV response: {}", response_str);
        
        // Parse response
        // Clean: "stream: OK"
        // Infected: "stream: <virus_name> FOUND"
        // Error: "stream: <error> ERROR"
        if response_str.ends_with("OK") {
            Ok(ScanResult::Clean)
        } else if response_str.contains("FOUND") {
            // Extract virus name
            let parts: Vec<&str> = response_str.split(':').collect();
            let threat = if parts.len() > 1 {
                parts[1].trim().replace(" FOUND", "")
            } else {
                "Unknown threat".to_string()
            };
            Ok(ScanResult::Infected { threat_name: threat })
        } else if response_str.contains("ERROR") {
            Ok(ScanResult::Error {
                reason: response_str.to_string(),
            })
        } else {
            Ok(ScanResult::Error {
                reason: format!("Unexpected ClamAV response: {}", response_str),
            })
        }
    }
    
    async fn health_check(&self) -> bool {
        match self.connect().await {
            Ok(mut stream) => {
                if stream.write_all(b"zPING\0").await.is_err() {
                    return false;
                }
                if stream.flush().await.is_err() {
                    return false;
                }
                
                let mut response = [0u8; 16];
                match stream.read(&mut response).await {
                    Ok(n) => {
                        let resp = String::from_utf8_lossy(&response[..n]);
                        resp.contains("PONG")
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    }
}

/// No-op scanner for development/testing
pub struct NoOpScanner;

#[async_trait::async_trait]
impl VirusScanner for NoOpScanner {
    async fn scan(&self, _data: &[u8]) -> Result<ScanResult> {
        tracing::warn!("NoOpScanner: Skipping virus scan (development mode)");
        Ok(ScanResult::Clean)
    }
    
    async fn health_check(&self) -> bool {
        true
    }
}

/// Scanner that always returns infected (for testing)
#[cfg(test)]
pub struct AlwaysInfectedScanner;

#[cfg(test)]
#[async_trait::async_trait]
impl VirusScanner for AlwaysInfectedScanner {
    async fn scan(&self, _data: &[u8]) -> Result<ScanResult> {
        Ok(ScanResult::Infected {
            threat_name: "Test.Virus.EICAR".to_string(),
        })
    }
    
    async fn health_check(&self) -> bool {
        true
    }
}

/// Factory function to create appropriate scanner based on config
pub fn create_scanner(scanner_type: &str) -> Box<dyn VirusScanner> {
    match scanner_type.to_lowercase().as_str() {
        "clamav" => Box::new(ClamAvScanner::from_env()),
        "noop" | "none" | "disabled" => Box::new(NoOpScanner),
        _ => {
            tracing::warn!("Unknown scanner type '{}', using NoOpScanner", scanner_type);
            Box::new(NoOpScanner)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_noop_scanner() {
        let scanner = NoOpScanner;
        let result = scanner.scan(b"test content").await.unwrap();
        assert!(matches!(result, ScanResult::Clean));
        assert!(scanner.health_check().await);
    }
    
    #[tokio::test]
    async fn test_always_infected_scanner() {
        let scanner = AlwaysInfectedScanner;
        let result = scanner.scan(b"test content").await.unwrap();
        assert!(matches!(result, ScanResult::Infected { .. }));
    }
    
    #[tokio::test]
    async fn test_create_scanner() {
        let scanner = create_scanner("noop");
        assert!(scanner.health_check().await);
        
        let scanner = create_scanner("disabled");
        assert!(scanner.health_check().await);
    }
}
