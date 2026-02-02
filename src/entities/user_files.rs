use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user_files")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub user_id: String,
    pub storage_file_id: Option<String>,
    pub parent_id: Option<String>,
    pub is_folder: bool,
    pub filename: String,
    pub expires_at: Option<DateTimeUtc>,
    pub created_at: Option<DateTimeUtc>,
    pub deleted_at: Option<DateTimeUtc>,
    pub file_signature: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::storage_files::Entity",
        from = "Column::StorageFileId",
        to = "super::storage_files::Column::Id",
        on_update = "Cascade",
        on_delete = "SetNull"
    )]
    StorageFiles,
    #[sea_orm(
        belongs_to = "super::users::Entity",
        from = "Column::UserId",
        to = "super::users::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Users,
    #[sea_orm(has_many = "super::file_tags::Entity")]
    FileTags,
}

impl Related<super::file_tags::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::FileTags.def()
    }
}

impl Related<super::storage_files::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::StorageFiles.def()
    }
}

impl Related<super::users::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Users.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
