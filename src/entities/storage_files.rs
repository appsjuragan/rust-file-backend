use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "storage_files")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub hash: String,
    pub s3_key: String,
    pub size: i64,
    pub ref_count: i32,
    pub scan_status: Option<String>,
    pub scan_result: Option<String>,
    pub scanned_at: Option<DateTimeUtc>,
    pub mime_type: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::user_files::Entity")]
    UserFiles,
}

impl Related<super::user_files::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserFiles.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
