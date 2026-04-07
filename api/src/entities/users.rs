use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub username: String,
    pub password_hash: Option<String>,
    #[sea_orm(unique)]
    pub oidc_sub: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: Option<DateTimeUtc>,
    #[sea_orm(default_value = false)]
    pub is_admin: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::tokens::Entity")]
    Tokens,
    #[sea_orm(has_many = "super::user_files::Entity")]
    UserFiles,
    #[sea_orm(has_many = "super::audit_logs::Entity")]
    AuditLogs,
    #[sea_orm(has_many = "super::user_group_members::Entity")]
    UserGroupMembers,
}

impl Related<super::tokens::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Tokens.def()
    }
}

impl Related<super::user_files::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserFiles.def()
    }
}

impl Related<super::audit_logs::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::AuditLogs.def()
    }
}

impl Related<super::user_group_members::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UserGroupMembers.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
