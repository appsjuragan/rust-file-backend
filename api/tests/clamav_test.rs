use rust_file_backend::services::scanner::{ClamAvScanner, ScanResult, VirusScanner};

#[tokio::test]
async fn test_clamav_connection_and_scan() {
    // 1. Setup Scanner checking localhost:3310
    let scanner = ClamAvScanner::new("127.0.0.1".to_string(), 3310);

    // 2. Health Check (Skip test if ClamAV is not reachable)
    if !scanner.health_check().await {
        println!("⚠️ ClamAV not reachable at 127.0.0.1:3310, skipping integration test.");
        return;
    }

    // 3. Scan Clean Data
    let clean_data = b"Hello, this is a clean file.";
    let reader = Box::pin(std::io::Cursor::new(clean_data));
    let result = scanner.scan(reader).await.expect("Scan failed");
    match result {
        ScanResult::Clean => {}
        _ => panic!("Expected clean result, got {:?}", result),
    }

    // 4. Scan Infected Data (EICAR)
    // We reconstruct the EICAR string at runtime to avoid triggering local antivirus on the host machine.
    let part1 = "X5O!P%@AP[4\\PZ";
    let part2 = "X54(P^)7CC)7}$EICAR-STANDA";
    let part3 = "RD-ANTIVIRUS-TEST-FILE!$H+H*";
    let eicar_str = format!("{}{}{}", part1, part2, part3);
    let eicar = eicar_str.as_bytes();

    let reader = Box::pin(std::io::Cursor::new(eicar.to_vec()));
    let result = scanner.scan(reader).await.expect("Scan failed");
    match result {
        ScanResult::Infected { threat_name: msg } => {
            println!("Detected virus: {}", msg);
            assert!(msg.to_lowercase().contains("eicar"), "Should detect Eicar");
        }
        _ => panic!("Expected infected result for EICAR"),
    }
}
