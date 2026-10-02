param (
    [string]$BaseUrl = "http://localhost:8000"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1. Testing Java Compilation & Stdout" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$javaCode = @'
public class Main {
    public static void main(String[] args) {
        System.out.println("Java Sandbox Execution Success!");
        int a = 25;
        int b = 4;
        System.out.println("Calculation Result: " + (a * b));
    }
}
'@

$body = @{
    source_code = $javaCode
    language    = "java"
    stdin       = ""
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/run" -Method Post -Body $body -ContentType "application/json; charset=utf-8"
    $response | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Green
} catch {
    Write-Host "Java execution failed: $_" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "2. Testing Java Stdin Input" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$javaStdinCode = @'
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        if (scanner.hasNextLine()) {
            String name = scanner.nextLine();
            System.out.println("Hello, " + name + "! Welcome to Sandbox.");
        }
    }
}
'@

$stdinBody = @{
    source_code = $javaStdinCode
    language    = "java"
    stdin       = "Developer"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/run" -Method Post -Body $stdinBody -ContentType "application/json; charset=utf-8"
    $response | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor Green
} catch {
    Write-Host "Java Stdin test failed: $_" -ForegroundColor Red
}
