# PowerShellVersion = '5.1' is a commented-out manifest key, not a declaration.
function Get-Lookalike {
    [CmdletBinding()]
    param()
    $message = "Requires PowerShell 7.0 or later"
    $message
}

Export-ModuleMember -Function Get-Lookalike
