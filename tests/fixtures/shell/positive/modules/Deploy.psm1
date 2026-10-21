#Requires -Version 7.0

function Get-DeployTarget {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )
    $Name
}

Export-ModuleMember -Function Get-DeployTarget
