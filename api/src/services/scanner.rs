use anyhow::{Result, anyhow};
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

use std::pin::Pin;
use tokio::io::AsyncRead;

/// Trait for virus scanning implementations
#[async_trait::async_trait]
pub trait VirusScanner: Send + Sync {
    /// Scan file content for malware using a stream
    async fn scan(&self, mut reader: Pin<Box<dyn AsyncRead + Send>>) -> Result<ScanResult>;

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
    async fn scan(&self, mut reader: Pin<Box<dyn AsyncRead + Send>>) -> Result<ScanResult> {
        let mut stream = self.connect().await?;

        // Use INSTREAM command for streaming data to clamd
        // Format: zINSTREAM\0 <length:u32 big-endian> <data> ... <0:u32>
        stream.write_all(b"zINSTREAM\0").await?;

        // Send data in chunks
        const CHUNK_SIZE: usize = 4 * 1024 * 1024; // 4MB chunks for better socket responsiveness
        let mut buffer = vec![0u8; CHUNK_SIZE];

        let mut total_sent = 0;
        let mut response = Vec::new();
        let mut write_done = false;
        let mut read_done = false;
        let mut write_error: Option<std::io::Error> = None;
        let mut read_error: Option<std::io::Error> = None;

        let mut read_buf = [0u8; 1024];

        loop {
            tokio::select! {
                // Read from ClamAV
                read_res = stream.read(&mut read_buf), if !read_done => {
                    match read_res {
                        Ok(0) => {
                            read_done = true;
                        }
                        Ok(n) => {
                            response.extend_from_slice(&read_buf[..n]);
                            // If we already have a full response (ends with OK or contains FOUND), we can stop reading
                            let resp_str = String::from_utf8_lossy(&response);
                            if resp_str.contains("FOUND") || resp_str.contains("ERROR") || resp_str.ends_with("OK\n") || resp_str.ends_with("OK") {
                                read_done = true;
                                if !write_done {
                                     tracing::debug!("ClamAV sent early response: '{}', stopping stream.", resp_str.trim());
                                }
                                break;
                            }
                        }
                        Err(e) => {
                            tracing::debug!("ClamAV read error mid-stream: {}", e);
                            read_error = Some(e);
                            read_done = true;
                            break;
                        }
                    }
                }

                // Write to ClamAV
                write_chunk = reader.read(&mut buffer), if !write_done => {
                    match write_chunk {
                        Ok(0) => {
                            // Send zero-length chunk to indicate end of stream
                            if let Err(e) = stream.write_all(&0u32.to_be_bytes()).await {
                                tracing::warn!("Failed to send end-of-stream: {}", e);
                            }
                            let _ = stream.flush().await;
                            write_done = true;
                            tracing::debug!("Finished sending data to ClamAV ({} bytes)", total_sent);
                        }
                        Ok(n) => {
                            let len = (n as u32).to_be_bytes();
                            if let Err(e) = stream.write_all(&len).await {
                                tracing::warn!("ClamAV write error (len): {}", e);
                                write_error = Some(e);
                                write_done = true;
                            } else if let Err(e) = stream.write_all(&buffer[..n]).await {
                                tracing::warn!("ClamAV write error (data): {}", e);
                                write_error = Some(e);
                                write_done = true;
                            } else {
                                total_sent += n;
                                if total_sent % (100 * 1024 * 1024) == 0 {
                                    tracing::info!("Scan progress: {} MB sent to ClamAV...", total_sent / 1024 / 1024);
                                }
                            }
                        }
                        Err(e) => {
                            return Err(anyhow!("Failed to read from source: {}", e));
                        }
                    }
                }

                // Overall timeout
                _ = tokio::time::sleep(std::time::Duration::from_secs(1800)) => {
                    return Err(anyhow!("ClamAV scan timed out (total sent: {} bytes)", total_sent));
                }
            }

            if write_done && read_done {
                break;
            }
        }

        // Final attempt to read if we stopped because of a write error but haven't finished reading
        if !read_done {
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), async {
                while let Ok(n) = stream.read(&mut read_buf).await {
                    if n == 0 {
                        break;
                    }
                    response.extend_from_slice(&read_buf[..n]);
                    let resp_str = String::from_utf8_lossy(&response);
                    if resp_str.contains("FOUND")
                        || resp_str.contains("ERROR")
                        || resp_str.ends_with("OK")
                    {
                        break;
                    }
                }
            })
            .await;
        }

        if !response.is_empty() {
            let response_str = String::from_utf8_lossy(&response);
            let response_str = response_str.trim_end_matches('\0').trim();

            tracing::debug!("ClamAV final response: '{}'", response_str);

            if response_str.ends_with("OK") {
                return Ok(ScanResult::Clean);
            } else if response_str.contains("FOUND") {
                let parts: Vec<&str> = response_str.split(':').collect();
                let threat = if parts.len() > 1 {
                    parts[1].trim().replace(" FOUND", "")
                } else {
                    "Unknown threat".to_string()
                };
                return Ok(ScanResult::Infected {
                    threat_name: threat,
                });
            } else if response_str.contains("ERROR") {
                let reason = if response_str.contains("size limit exceeded") {
                    format!(
                        "ClamAV limit exceeded: {}. Please increase StreamMaxLength in clamd.conf",
                        response_str
                    )
                } else {
                    response_str.to_string()
                };
                return Ok(ScanResult::Error { reason });
            }
        }

        // Handle failure cases where no valid response was parsed
        if let Some(e) = read_error {
            if let Some(we) = write_error {
                return Err(anyhow!(
                    "ClamAV connection failed (ReadError: {}, WriteError: {}). No result received.",
                    e,
                    we
                ));
            }
            return Err(anyhow!("ClamAV read error: {}", e));
        }

        if let Some(e) = write_error {
            return Err(anyhow!(
                "ClamAV write error: {}. ClamAV closed connection without sending a result.",
                e
            ));
        }

        Err(anyhow!(
            "ClamAV returned no response (total sent: {} bytes)",
            total_sent
        ))
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
    async fn scan(&self, _reader: Pin<Box<dyn AsyncRead + Send>>) -> Result<ScanResult> {
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
    async fn scan(&self, _reader: Pin<Box<dyn AsyncRead + Send>>) -> Result<ScanResult> {
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
        let content = b"test content";
        let reader = Box::pin(std::io::Cursor::new(content));
        let result = scanner.scan(reader).await.unwrap();
        assert!(matches!(result, ScanResult::Clean));
        assert!(scanner.health_check().await);
    }

    #[tokio::test]
    async fn test_always_infected_scanner() {
        let scanner = AlwaysInfectedScanner;
        let content = b"test content";
        let reader = Box::pin(std::io::Cursor::new(content));
        let result = scanner.scan(reader).await.unwrap();
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
