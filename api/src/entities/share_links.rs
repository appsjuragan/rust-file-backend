use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "share_links")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub user_file_id: String,
    pub created_by: String,
    #[sea_orm(unique)]
    pub share_token: String,
    pub share_type: String, // "public" or "user"
    pub shared_with_user_id: Option<String>,
    pub password_hash: Option<String>,
    pub permission: String, // "view" or "download"
    pub expires_at: DateTimeUtc,
    pub created_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user_files::Entity",
        from = "Column::UserFileId",
        to = "super::user_files::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    UserFiles,
    #[sea_orm(
        belongs_to = "super::users::Entity",
        from = "Column::CreatedBy",
        to = "super::users::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Creator,
    #[sea_orm(has_many = "super::share_access_logs::Entity")]
    ShareAccessLogs,
}

impl Related<super::user_files::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserFiles.def()
    }
}

impl Related<super::share_access_logs::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ShareAccessLogs.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
