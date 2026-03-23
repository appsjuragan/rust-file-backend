use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// Tracks temporary ZIP archives for bulk/folder downloads
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "download_archives")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub user_id: String,
    /// S3 key of the uploaded ZIP – None while still generating
    pub s3_key: Option<String>,
    /// pending | generating | ready | failed
    pub status: String,
    pub filename: String,
    pub file_size: Option<i64>,
    pub error_message: Option<String>,
    pub created_at: DateTimeUtc,
    pub expires_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::users::Entity",
        from = "Column::UserId",
        to = "super::users::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Users,
}

impl Related<super::users::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Users.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
