pub struct StagedFile {
    pub key: String,
    pub hash: String,
    pub size: i64,
    pub s3_key: String,
    // Path to local temp file if available (for optimization)
    pub temp_path: Option<String>,
}
