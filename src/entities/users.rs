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
    #[sea_orm(column_type = "Text", nullable)]
    pub public_key: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub private_key_enc: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub private_key_path: Option<String>,
    pub created_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::tokens::Entity")]
    Tokens,
    #[sea_orm(has_many = "super::user_files::Entity")]
    UserFiles,
    #[sea_orm(has_many = "super::audit_logs::Entity")]
    AuditLogs,
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

impl ActiveModelBehavior for ActiveModel {}
