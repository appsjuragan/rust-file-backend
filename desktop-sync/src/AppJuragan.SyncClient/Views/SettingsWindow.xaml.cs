using System.Windows;
namespace AppJuragan.SyncClient.Views;
public partial class SettingsWindow : Window
{
    public SettingsWindow(ViewModels.SettingsViewModel vm)
    {
        InitializeComponent();
        DataContext = vm;
    }
}
