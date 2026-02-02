use dotenvy::dotenv;
use std::env;

#[derive(sqlx::FromRow, Debug)]
struct StorageFileRow {
    id: String,
    hash: String,
    ref_count: i32,
    s3_key: String,
}

#[tokio::main]
async fn main() {
    dotenv().ok();

    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("Usage: check_dedup <expected_ref_count> [hash]");
        return;
    }

    let expected_count: i32 = args[1].parse().expect("Invalid ref count");
    let target_hash_raw = if args.len() > 2 { Some(&args[2]) } else { None };
    let target_hash = target_hash_raw.map(|h| h.to_lowercase());

    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new()
        .connect(&db_url)
        .await
        .expect("Failed to connect to DB");

    let files = sqlx::query_as::<_, StorageFileRow>(
        "SELECT id, hash, ref_count, s3_key FROM storage_files",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    let mut found = false;
    for file in files {
        if let Some(ref h) = target_hash {
            if &file.hash != h {
                continue;
            }
        }

        println!(
            "Checking File: Hash={} RefCount={}",
            file.hash, file.ref_count
        );
        if file.ref_count == expected_count {
            println!("SUCCESS: RefCount matches expected ({})", expected_count);
            found = true;
        } else {
            println!(
                "FAIL: RefCount {} != expected {}",
                file.ref_count, expected_count
            );
            std::process::exit(1);
        }
    }

    if !found && target_hash.is_some() {
        if expected_count == 0 {
            println!("SUCCESS: Target hash not found (expected for RefCount 0)");
        } else {
            println!("FAIL: Target hash not found");
            std::process::exit(1);
        }
    }
}
