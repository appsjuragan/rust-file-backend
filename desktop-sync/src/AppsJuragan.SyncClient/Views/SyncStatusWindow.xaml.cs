using AppsJuragan.SyncClient.Views;
using System.Windows;

namespace AppsJuragan.SyncClient.Views;

public partial class SyncStatusWindow : Window
{
    public SyncStatusWindow(ViewModels.SyncStatusViewModel vm)
    {
        InitializeComponent();
        DataContext = vm;
    }
}
