using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using AppJuragan.SyncClient.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace AppJuragan.SyncClient.ViewModels
{
    public partial class SyncStatusViewModel : ObservableObject
    {
        private readonly SyncEngine _sync;
        private readonly SyncStateStore _state;
        private readonly SettingsService _settings;
        private readonly ApiClient _api;

        [ObservableProperty] private string _statusText = "Idle";
        [ObservableProperty] private int _totalSynced;
        [ObservableProperty] private int _totalShared;
        [ObservableProperty] private int _totalFavorites;
        [ObservableProperty] private UserProfileResponse? _profile;
        [ObservableProperty] private UserFactsResponse? _facts;
        [ObservableProperty] private string _storageFormatted = "0 B used";

        public ObservableCollection<string> ActivityLog { get; } = new();
        public ObservableCollection<SyncEntry> SharedItems { get; } = new();
        public ObservableCollection<SyncEntry> FavoriteItems { get; } = new();

        public SyncStatusViewModel(SyncEngine sync, SyncStateStore state, SettingsService settings, ApiClient api)
        {
            _sync = sync;
            _state = state;
            _settings = settings;
            _api = api;

            Refresh();
            _ = LoadAsync();

            sync.StatusChanged += (_, s) =>
                Application.Current.Dispatcher.Invoke(() =>
                {
                    StatusText = s.ToString();
                    Refresh();
                    _ = LoadAsync();
                });

            sync.FileActivity += (_, msg) =>
                Application.Current.Dispatcher.Invoke(() =>
                {
                    ActivityLog.Insert(0, $"[{DateTime.Now:HH:mm:ss}] {msg}");
                    while (ActivityLog.Count > 200) ActivityLog.RemoveAt(ActivityLog.Count - 1);
                });
        }

        private void Refresh()
        {
            var all = _state.All.Values.ToList();
            TotalSynced = all.Count(e => !e.IsFolder);
            TotalShared = all.Count(e => e.IsShared);
            TotalFavorites = all.Count(e => e.IsFavorite);

            SharedItems.Clear();
            foreach (var item in all.Where(i => i.IsShared).OrderByDescending(i => i.LastSynced).Take(20))
                SharedItems.Add(item);

            FavoriteItems.Clear();
            foreach (var item in all.Where(i => i.IsFavorite).OrderByDescending(i => i.LastSynced).Take(20))
                FavoriteItems.Add(item);
        }

        private async Task LoadAsync()
        {
            try
            {
                Profile = await _api.GetProfileAsync();
                Facts = await _api.GetUserFactsAsync();
                if (Facts != null)
                    StorageFormatted = FormatSize(Facts.TotalSize);
            }
            catch { /* quiet */ }
        }

        private string FormatSize(long bytes)
        {
            string[] units = { "B", "KB", "MB", "GB", "TB" };
            double size = bytes;
            int unitIndex = 0;
            while (size >= 1024 && unitIndex < units.Length - 1)
            {
                size /= 1024;
                unitIndex++;
            }
            return $"{size:N1} {units[unitIndex]} used";
        }

        [RelayCommand]
        private async Task SyncNowAsync() => await _sync.RunFullSyncAsync();

        [RelayCommand]
        private void OpenFolder()
        {
            var folder = _settings.Current.LocalSyncFolder;
            try { Process.Start(new ProcessStartInfo("explorer.exe", folder) { UseShellExecute = true }); }
            catch { /* ignore */ }
        }

        [RelayCommand]
        private async Task CopyShareLinkAsync(SyncEntry? entry)
        {
            if (entry == null) return;
            try
            {
                var shares = await _api.GetFileSharesAsync(entry.RemoteId);
                var publicShare = shares.FirstOrDefault(s => s.ShareType == "public");
                if (publicShare != null)
                {
                    var link = $"{_api.BaseUrl.Replace("/api/v1/", "/s/")}{publicShare.ShareToken}";
                    Clipboard.SetText(link);
                    _ = MessageBox.Show($"Public link copied to clipboard:\n{link}", "Share Link", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                {
                    MessageBox.Show("No public share link found for this item.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            catch (Exception ex) { MessageBox.Show($"Failed to fetch share link: {ex.Message}", "Error"); }
        }

        [RelayCommand]
        private void CopyLocalPath(SyncEntry? entry)
        {
            if (entry == null) return;
            var fullPath = Path.Combine(_settings.Current.LocalSyncFolder, entry.RelativePath);
            Clipboard.SetText(fullPath);
        }

        [RelayCommand]
        private void OpenItemInExplorer(SyncEntry? entry)
        {
            if (entry == null) return;
            var fullPath = Path.Combine(_settings.Current.LocalSyncFolder, entry.RelativePath);
            if (File.Exists(fullPath) || Directory.Exists(fullPath))
            {
                Process.Start("explorer.exe", $"/select,\"{fullPath}\"");
            }
        }
    }
}
