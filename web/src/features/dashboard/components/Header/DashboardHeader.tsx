import React from "react";
import { Search, User, Moon, LogOut, ChevronDown, Sun } from "lucide-react";
import "./DashboardHeader.css";

interface DashboardHeaderProps {
    profile: { name?: string; email?: string; avatarUrl?: string };
    username: string;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    dropdownVisible: boolean;
    setDropdownVisible: (visible: boolean) => void;
    setProfileModalVisible: (visible: boolean) => void;
    theme: string;
    toggleTheme: () => void;
    onLogout: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    profile,
    username,
    searchQuery,
    setSearchQuery,
    dropdownVisible,
    setDropdownVisible,
    setProfileModalVisible,
    theme,
    toggleTheme,
    onLogout,
}) => {
    return (
        <header className="app-header">
            <div className="logo">
                <div className="logo-icon">🚀</div>
                <span>File Manager</span>
            </div>
            <div className="global-search-container">
                <div className="search-input-wrapper">
                    <Search className="search-icon-svg" size={18} />
                    <input
                        type="text"
                        placeholder="Global file search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="global-search-input"
                    />
                </div>
            </div>
            <div className="user-info">
                <div className="user-dropdown-container" onClick={() => setDropdownVisible(!dropdownVisible)}>
                    <span className="user-username-header">{profile.name || username}</span>
                    <div className="user-avatar-small" style={{ color: 'white' }}>
                        {profile.avatarUrl ? (
                            <img src={profile.avatarUrl} className="user-avatar-img" alt="User" />
                        ) : (
                            <span className="user-avatar-initial">{(profile.name || username).charAt(0).toUpperCase()}</span>
                        )}
                    </div>
                    <ChevronDown size={16} className={`dropdown-arrow ${dropdownVisible ? 'rotated' : ''}`} />

                    {dropdownVisible && (
                        <div className="user-dropdown-menu" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <div className="dropdown-user-header">
                                <strong>{profile.name || username}</strong>
                                <small>{profile.email}</small>
                            </div>
                            <div className="dropdown-divider" />
                            <div className="dropdown-item" onClick={() => { setProfileModalVisible(true); setDropdownVisible(false); }}>
                                <User size={16} /> Profile
                            </div>
                            <div className="dropdown-item" onClick={() => { toggleTheme(); setDropdownVisible(false); }}>
                                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                            </div>
                            <div className="dropdown-divider" />
                            <div className="dropdown-item logout" onClick={onLogout}>
                                <LogOut size={16} /> Logout
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
