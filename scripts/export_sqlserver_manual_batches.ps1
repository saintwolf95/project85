<##
Exportación manual por lotes desde las vistas SQL Server para subir a Data Engineering.

Requisitos: PowerShell con el módulo SqlServer y una variable de entorno privada
SQLSERVER_CONNECTION_STRING. No incluyas contraseñas en este archivo.
##>
[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\exports-sql"),
    [datetime]$SalesStart = [datetime]'2025-05-01',
    [int]$SalesMonthsPerFile = 1,
    [int]$InventoryDaysPerFile = 7
)

$ErrorActionPreference = 'Stop'
$connectionString = $env:SQLSERVER_CONNECTION_STRING
if ([string]::IsNullOrWhiteSpace($connectionString)) {
    throw 'Define SQLSERVER_CONNECTION_STRING como variable de entorno antes de ejecutar este script.'
}
if ($SalesMonthsPerFile -lt 1 -or $InventoryDaysPerFile -lt 1) {
    throw 'Los tamaños de lote deben ser mayores que cero.'
}

Import-Module SqlServer -ErrorAction Stop

function Get-ScalarDate([string]$Query) {
    $value = Invoke-Sqlcmd -ConnectionString $connectionString -Query $Query -QueryTimeout 300 -ErrorAction Stop
    $first = @($value)[0]
    if ($null -eq $first) {
        throw 'La vista no devolvió una fecha máxima.'
    }
    return [datetime]$first.max_date
}

function Export-DateBatches(
    [string]$View,
    [string]$DateColumn,
    [datetime]$Start,
    [datetime]$EndInclusive,
    [scriptblock]$NextDate,
    [string]$Prefix,
    [string]$Directory
) {
    $current = $Start.Date
    $end = $EndInclusive.Date.AddDays(1)
    while ($current -lt $end) {
        $next = & $NextDate $current
        if ($next -gt $end) { $next = $end }
        $fileName = '{0}_{1}_{2}.csv' -f $Prefix, $current.ToString('yyyy-MM-dd'), $next.AddDays(-1).ToString('yyyy-MM-dd')
        $target = Join-Path $Directory $fileName
        $query = @"
SELECT *
FROM $View
WHERE $DateColumn >= '$($current.ToString('yyyy-MM-dd'))'
  AND $DateColumn < '$($next.ToString('yyyy-MM-dd'))'
ORDER BY $DateColumn, articulo_pk;
"@
        Write-Host "Exportando $fileName" -ForegroundColor Cyan
        $rows = Invoke-Sqlcmd -ConnectionString $connectionString -Query $query -QueryTimeout 0 -ErrorAction Stop
        if ($null -eq $rows -or $rows.Count -eq 0) {
            Write-Warning "Sin datos: $fileName"
        } else {
            if ($rows.Count -gt 150000) {
                Write-Warning "$fileName supera 150.000 filas. Reduce el período de este lote antes de subirlo."
            }
            # Export-Csv entrecomilla textos con comas y conserva Unicode con BOM.
            $rows | Export-Csv -LiteralPath $target -NoTypeInformation -Encoding UTF8 -Delimiter ','
            Write-Host "  $($rows.Count) filas -> $target" -ForegroundColor Green
        }
        $current = $next
    }
}

$salesDirectory = Join-Path $OutputDirectory 'ventas'
$inventoryDirectory = Join-Path $OutputDirectory 'inventario'
New-Item -ItemType Directory -Force -Path $salesDirectory, $inventoryDirectory | Out-Null

$salesEnd = Get-ScalarDate 'SELECT MAX(fecha_venta) AS max_date FROM dbo.vw_ventas_supabase;'
$inventoryStart = Get-ScalarDate 'SELECT MIN(fecha_inventario) AS max_date FROM dbo.vw_inventario_supabase;'
$inventoryEnd = Get-ScalarDate 'SELECT MAX(fecha_inventario) AS max_date FROM dbo.vw_inventario_supabase;'

Export-DateBatches -View 'dbo.vw_ventas_supabase' -DateColumn 'fecha_venta' -Start $SalesStart -EndInclusive $salesEnd `
    -NextDate { param($value) $value.AddMonths($SalesMonthsPerFile) } -Prefix 'fivemin_ventas' -Directory $salesDirectory
Export-DateBatches -View 'dbo.vw_inventario_supabase' -DateColumn 'fecha_inventario' -Start $inventoryStart -EndInclusive $inventoryEnd `
    -NextDate { param($value) $value.AddDays($InventoryDaysPerFile) } -Prefix 'fivemin_inventario' -Directory $inventoryDirectory

Write-Host "Exportación terminada. Revisa los CSV en: $OutputDirectory" -ForegroundColor Green
