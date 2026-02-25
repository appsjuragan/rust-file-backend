use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "share_access_logs")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub share_link_id: String,
    pub accessed_by_user_id: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub action: String, // "view", "download", "password_attempt"
    pub accessed_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::share_links::Entity",
        from = "Column::ShareLinkId",
        to = "super::share_links::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    ShareLinks,
}

impl Related<super::share_links::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ShareLinks.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
