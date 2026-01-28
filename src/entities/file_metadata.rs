use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "file_metadata")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub storage_file_id: String,
    pub category: String, // e.g., image, video, audio, text, document
    pub metadata: Json,   // Flexible JSON storage
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::storage_files::Entity",
        from = "Column::StorageFileId",
        to = "super::storage_files::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    StorageFiles,
}

impl Related<super::storage_files::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::StorageFiles.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
