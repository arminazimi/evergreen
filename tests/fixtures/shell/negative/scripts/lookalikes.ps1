#Requires -Modules Pester
# #Requires -Version 3.0 is only a comment here.
<#
.NOTES
    #Requires -Version 2.0 appears only inside this block comment.
#>
$note = '#Requires -Version 4.0 is a string literal.'
$isCore = $PSVersionTable.PSVersion -ge [version]'7.0'
$PowerShellVersion = $env:POWERSHELL_MIN_VERSION
