use crate::api::error::AppError;
use crate::entities::{prelude::*, users, user_groups, user_group_members};
use crate::utils::auth::Claims;
use axum::{
    Extension, Json,
    extract::{Path, State},
};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set, QuerySelect};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct GroupResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Deserialize, utoipa::ToSchema)]
pub struct CreateGroupRequest {
    pub name: String,
    pub description: Option<String>,
}

pub async fn check_admin(state: &crate::AppState, claims: &Claims) -> Result<(), AppError> {
    let user = Users::find_by_id(&claims.sub)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;
        
    if !user.is_admin {
        return Err(AppError::Forbidden("Admin access required".to_string()));
    }
    Ok(())
}

pub async fn list_groups(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<GroupResponse>>, AppError> {
    check_admin(&state, &claims).await?;

    let groups = UserGroups::find()
        .all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let res = groups.into_iter().map(|g| GroupResponse {
        id: g.id,
        name: g.name,
        description: g.description,
    }).collect();

    Ok(Json(res))
}

pub async fn create_group(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<CreateGroupRequest>,
) -> Result<Json<GroupResponse>, AppError> {
    check_admin(&state, &claims).await?;

    let new_group = user_groups::ActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        name: Set(payload.name.clone()),
        description: Set(payload.description.clone()),
        ..Default::default()
    };

    let inserted = new_group.insert(&state.db).await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Add creator to group automatically
    let creator_member = user_group_members::ActiveModel {
        user_id: Set(claims.sub.clone()),
        group_id: Set(inserted.id.clone()),
        ..Default::default()
    };
    creator_member.insert(&state.db).await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(GroupResponse {
        id: inserted.id,
        name: inserted.name,
        description: inserted.description,
    }))
}

pub async fn delete_group(
    Path(group_id): Path<String>,
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<()>, AppError> {
    check_admin(&state, &claims).await?;

    UserGroups::delete_by_id(&group_id)
        .exec(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(()))
}

pub async fn add_user_to_group(
    Path((group_id, user_id)): Path<(String, String)>,
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<()>, AppError> {
    check_admin(&state, &claims).await?;

    let member = user_group_members::ActiveModel {
        user_id: Set(user_id),
        group_id: Set(group_id),
        ..Default::default()
    };

    member.insert(&state.db).await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(()))
}

pub async fn remove_user_from_group(
    Path((group_id, user_id)): Path<(String, String)>,
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<()>, AppError> {
    check_admin(&state, &claims).await?;

    user_group_members::Entity::delete_by_id((user_id, group_id))
        .exec(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(()))
}

pub async fn list_group_members(
    Path(group_id): Path<String>,
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<UserSearchResponse>>, AppError> {
    check_admin(&state, &claims).await?;

    let members = user_group_members::Entity::find()
        .filter(user_group_members::Column::GroupId.eq(&group_id))
        .find_also_related(users::Entity)
        .all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let res = members.into_iter().filter_map(|(_m, u)| {
        u.map(|user| UserSearchResponse {
            id: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
        })
    }).collect();

    Ok(Json(res))
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct UserSearchResponse {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub name: Option<String>,
}

pub async fn search_users(
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<UserSearchResponse>>, AppError> {
    check_admin(&state, &claims).await?;
    let q = params.get("q").cloned().unwrap_or_default();
    
    let mut query = Users::find();
    if !q.is_empty() {
        query = query.filter(
            sea_orm::Condition::any()
                .add(users::Column::Username.contains(&q))
                .add(users::Column::Email.contains(&q))
                .add(users::Column::Name.contains(&q))
        );
    }
        
    let users = query.limit(20).all(&state.db).await
        .map_err(|e| AppError::Internal(e.to_string()))?;
        
    let res = users.into_iter().map(|u| UserSearchResponse {
        id: u.id,
        username: u.username,
        email: u.email,
        name: u.name,
    }).collect();
    
    Ok(Json(res))
}
