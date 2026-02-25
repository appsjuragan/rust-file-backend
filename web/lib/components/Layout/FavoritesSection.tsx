import React from "react";
import SvgIcon from "../Icons/SvgIcon";
import FavoriteItem from "./FavoriteItem";
import type { FileType } from "../../types";

interface FavoritesSectionProps {
    favorites: FileType[];
    isMinimized: boolean;
    onToggleMinimized: () => void;
    onRemoveFavorite: (fav: FileType) => void;
    onSelectFavorite: (fav: FileType) => void;
}

const FavoritesSection = ({
    favorites,
    isMinimized,
    onToggleMinimized,
    onRemoveFavorite,
    onSelectFavorite,
}: FavoritesSectionProps) => {
    if (favorites.length === 0) return null;

    return (
        <div
            className={`rfm-sidebar-facts ${isMinimized ? "minimized" : ""}`}
        >
            <div
                className="rfm-facts-header"
                onClick={onToggleMinimized}
            >
                <div className="rfm-facts-title font-bold text-[10px] opacity-80 uppercase tracking-wider">
                    <SvgIcon svgType="star" size={14} className="mr-1.5 opacity-70" />
                    Favorites
                </div>
                <button
                    type="button"
                    className="rfm-facts-toggle-btn"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleMinimized();
                    }}
                >
                    <SvgIcon
                        svgType={isMinimized ? "plus" : "minus"}
                        size={12}
                    />
                </button>
            </div>

            {!isMinimized && (
                <div className="rfm-facts-container">
                    <div className="rfm-facts-content">
                        <div className="rfm-sidebar-favorites-scroll">
                            <div className="rfm-fact-category-list">
                                {favorites.map((fav) => (
                                    <FavoriteItem
                                        key={fav.id}
                                        fav={fav}
                                        onRemove={() => onRemoveFavorite(fav)}
                                        onSelect={onSelectFavorite}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FavoritesSection;
