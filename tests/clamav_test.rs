use rust_file_backend::services::scanner::{ClamAvScanner, ScanResult, VirusScanner};

#[tokio::test]
#[ignore]
async fn test_clamav_connection_and_scan() {
    // 1. Setup Scanner checking localhost:3310
    let scanner = ClamAvScanner::new("127.0.0.1".to_string(), 3310);

    // 2. Health Check
    assert!(scanner.health_check().await, "ClamAV should be reachable");

    // 3. Scan Clean Data
    let clean_data = b"Hello, this is a clean file.";
    let result = scanner.scan(clean_data).await.expect("Scan failed");
    match result {
        ScanResult::Clean => {}
        _ => panic!("Expected clean result, got {:?}", result),
    }

    // 4. Scan Infected Data (EICAR)
    // EICAR test string
    let eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    let result = scanner.scan(eicar).await.expect("Scan failed");
    match result {
        ScanResult::Infected { threat_name: msg } => {
            println!("Detected virus: {}", msg);
            assert!(
                msg.contains("Eicar") || msg.contains("EICAR"),
                "Should detect Eicar"
            );
        }
        _ => panic!("Expected infected result for EICAR"),
    }
}
