use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "tags")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::file_tags::Entity")]
    FileTags,
}

impl Related<super::file_tags::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::FileTags.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
