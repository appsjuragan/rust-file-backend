using System;
using System.Threading;
using System.Threading.Tasks;
using AppJuragan.SyncClient.Views;
using Hardcodet.Wpf.TaskbarNotification;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Drawing;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace AppJuragan.SyncClient.Services;

public class TrayIconService : IDisposable
{
    private readonly IServiceProvider _sp;
    private readonly SyncEngine _sync;
    private readonly AuthService _auth;
    private readonly ILogger<TrayIconService> _log;
    private TaskbarIcon? _tray;

    // Shared tooltip elements updated dynamically
    private TextBlock? _tooltipTitle;
    private TextBlock? _tooltipStatus;
    private UserProfileResponse? _profile;

    public TrayIconService(IServiceProvider sp, SyncEngine sync,
        AuthService auth, ILogger<TrayIconService> log)
    {
        _sp = sp;
        _sync = sync;
        _auth = auth;
        _log = log;
    }

    private DateTime _lastNotification = DateTime.MinValue;

    public void Initialize()
    {
        // Build the always-dark custom tooltip
        _tooltipTitle = new TextBlock
        {
            Text = "AppJuragan Sync",
            Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x7C, 0x6A, 0xF0)),
            FontSize = 13,
            FontWeight = FontWeights.Bold,
            FontFamily = new System.Windows.Media.FontFamily("Segoe UI Variable, Segoe UI, sans-serif")
        };
        _tooltipStatus = new TextBlock
        {
            Text = "Idle",
            Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x8B, 0x8F, 0xA8)),
            FontSize = 12,
            FontFamily = new System.Windows.Media.FontFamily("Segoe UI Variable, Segoe UI, sans-serif"),
            Margin = new Thickness(0, 2, 0, 0)
        };

        var tooltipPanel = new StackPanel { Margin = new Thickness(0) };
        tooltipPanel.Children.Add(_tooltipTitle);
        tooltipPanel.Children.Add(_tooltipStatus);

        var tooltipBorder = new Border
        {
            Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x1E, 0x21, 0x30)),
            BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x2A, 0x2D, 0x3E)),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(12, 8, 12, 8),
            Child = tooltipPanel
        };

        _tray = new TaskbarIcon
        {
            // ToolTipText must be empty so TrayToolTip takes over completely
            ToolTipText = "",
            TrayToolTip = tooltipBorder,
            Icon = LoadIcon("app"),
            ContextMenu = BuildContextMenu()
        };

        _tray.TrayMouseDoubleClick += (_, _) => ShowStatus();

        _sync.StatusChanged += (_, status) =>
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                _tray.Icon = LoadIcon(status switch
                {
                    SyncStatus.Syncing => "syncing",
                    SyncStatus.Error => "error",
                    SyncStatus.Paused => "paused",
                    _ => "app"
                });
                if (_tooltipStatus != null)
                    _tooltipStatus.Text = status.ToString();
            });
        };

        _sync.FileActivity += (_, msg) =>
        {
            if (_sp.GetRequiredService<SettingsService>().Current.ShowNotifications)
            {
                Application.Current.Dispatcher.Invoke(() =>
                {
                    // Always update the tooltip status text
                    if (_tooltipStatus != null)
                        _tooltipStatus.Text = msg.Length > 50 ? msg[..47] + "…" : msg;
                });

                if ((DateTime.Now - _lastNotification).TotalSeconds > 5)
                {
                    _lastNotification = DateTime.Now;
                    Application.Current.Dispatcher.Invoke(() =>
                    {
                        _tray?.ShowBalloonTip("AppJuragan Sync", msg, BalloonIcon.Info);
                    });
                }
            }
        };

        // Try to load profile to show in context menu
        _ = Task.Run(LoadProfileAsync);
    }

    private async Task LoadProfileAsync()
    {
        if (!_auth.IsAuthenticated) return;

        try
        {
            var api = _sp.GetRequiredService<ApiClient>();
            _profile = await api.GetProfileAsync();

            // Rebuild context menu once profile is loaded
            Application.Current.Dispatcher.Invoke(() =>
            {
                if (_tray != null)
                {
                    _tray.ContextMenu = BuildContextMenu();
                }
            });
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Failed to load user profile for tray icon");
        }
    }

    private ContextMenu BuildContextMenu()
    {
        var menu = new ContextMenu
        {
            Style = (Style)Application.Current.FindResource("TrayContextMenu")
        };

        if (_profile != null)
        {
            var userPanel = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(4, 2, 8, 2) };
            
            // Avatar circle
            var avatarBorder = new Border
            {
                Width = 28,
                Height = 28,
                CornerRadius = new CornerRadius(14),
                Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x7C, 0x6A, 0xF0)),
                Margin = new Thickness(0, 0, 10, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            
            var initials = string.IsNullOrEmpty(_profile.Name) ? _profile.Username[..1].ToUpper() : _profile.Name[..1].ToUpper();
            avatarBorder.Child = new TextBlock
            {
                Text = initials,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = System.Windows.Media.Brushes.White,
                FontSize = 12,
                FontWeight = FontWeights.Bold
            };

            var textPanel = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            textPanel.Children.Add(new TextBlock 
            { 
                Text = _profile.Name ?? _profile.Username, 
                FontWeight = FontWeights.SemiBold,
                Foreground = System.Windows.Media.Brushes.White,
                FontSize = 13
            });
            textPanel.Children.Add(new TextBlock 
            { 
                Text = _profile.Email ?? $"@{_profile.Username}", 
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x8B, 0x8F, 0xA8)),
                FontSize = 10,
                Margin = new Thickness(0, -1, 0, 0)
            });

            userPanel.Children.Add(avatarBorder);
            userPanel.Children.Add(textPanel);

            var userHeaderItem = new MenuItem { Header = userPanel, IsEnabled = false, Padding = new Thickness(10, 4, 10, 4) };
            menu.Items.Add(userHeaderItem);
            menu.Items.Add(new Separator());
        }

        var statusItem = new MenuItem { Header = "Sync Status...", FontWeight = FontWeights.Bold };
        statusItem.Click += (_, _) => ShowStatus();
        menu.Items.Add(statusItem);

        var syncNowItem = new MenuItem { Header = "Sync Now" };
        syncNowItem.Click += async (_, _) => await _sync.RunFullSyncAsync();
        menu.Items.Add(syncNowItem);

        menu.Items.Add(new Separator());

        var settingsItem = new MenuItem { Header = "Settings..." };
        settingsItem.Click += (_, _) => ShowSettings();
        menu.Items.Add(settingsItem);

        menu.Items.Add(new Separator());

        var signOutItem = new MenuItem { Header = "Sign Out" };
        signOutItem.Click += async (_, _) =>
        {
            _tray?.Dispose();
            _tray = null;
            
            _auth.ClearToken();
            _profile = null;
            
            try 
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                await _sync.StopAsync(cts.Token);
            }
            finally 
            {
                // Restart the app to show login window
                System.Windows.Forms.Application.Restart();
                Application.Current.Shutdown();
            }
        };
        menu.Items.Add(signOutItem);

        var exitItem = new MenuItem { Header = "Exit" };
        exitItem.Click += async (_, _) =>
        {
            // Close the icon immediately so it disappears from the tray instantly
            _tray?.Dispose();
            _tray = null;

            // Wait for engine stop with a 3s timeout
            try 
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                await _sync.StopAsync(cts.Token);
            }
            finally 
            {
                Application.Current.Shutdown();
            }
        };
        menu.Items.Add(exitItem);

        return menu;
    }

    private void ShowStatus()
    {
        var win = _sp.GetRequiredService<SyncStatusWindow>();
        win.Show();
        win.Activate();
    }

    private void ShowSettings()
    {
        var win = _sp.GetRequiredService<SettingsWindow>();
        win.Show();
        win.Activate();
    }

    private static Icon LoadIcon(string name)
    {
        try
        {
            var uri = new Uri($"pack://application:,,,/Resources/Icons/{name}.ico");
            var streamInfo = Application.GetResourceStream(uri);
            if (streamInfo != null) return new Icon(streamInfo.Stream);
        }
        catch { }

        return SystemIcons.Application;
    }

    public void Dispose() => _tray?.Dispose();
}
