using System.Windows;
namespace AppsJuragan.SyncClient.Views;

public partial class SettingsWindow : Window
{
    public SettingsWindow(ViewModels.SettingsViewModel vm)
    {
        InitializeComponent();
        DataContext = vm;
        
        // Listen for the RequestClose event from the ViewModel
        vm.RequestClose += (s, e) => Close();
    }
}
