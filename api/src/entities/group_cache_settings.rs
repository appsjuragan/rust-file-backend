use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "group_cache_settings")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub group_id: String,
    pub cache_ttl_seconds: i32,
    pub updated_at: Option<DateTimeUtc>,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user_groups::Entity",
        from = "Column::GroupId",
        to = "super::user_groups::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    UserGroup,
}

impl Related<super::user_groups::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserGroup.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
