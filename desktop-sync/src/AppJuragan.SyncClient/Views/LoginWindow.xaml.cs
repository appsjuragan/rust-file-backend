using AppJuragan.SyncClient.ViewModels;
using System.Windows;

namespace AppJuragan.SyncClient.Views;

public partial class LoginWindow : Window
{
    private readonly LoginViewModel _vm;

    public LoginWindow(LoginViewModel vm)
    {
        InitializeComponent();
        _vm = vm;
        DataContext = vm;

        vm.LoginSucceeded += OnLoginSucceeded;
    }

    private void OnLoginSucceeded(object? sender, EventArgs e)
    {
        Dispatcher.Invoke(() =>
        {
            // Give the user a moment to see the success message
            Task.Delay(1500).ContinueWith(_ => Dispatcher.Invoke(Close));
        });
    }
}
