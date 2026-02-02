use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "file_tags")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub user_file_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub tag_id: String,
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
        belongs_to = "super::tags::Entity",
        from = "Column::TagId",
        to = "super::tags::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Tags,
}

impl Related<super::user_files::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserFiles.def()
    }
}

impl Related<super::tags::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Tags.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
