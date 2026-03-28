$headers = @{ "Authorization" = 'Bearer PanamaRegistry2026SecureToken' }
$body = '{
    "name": "Panama Tech Corp",
    "category": "Software",
    "event_type": "news_mention",
    "source_url": "https://example.com",
    "summary_es": "Empresa fundada en 2026.",
    "summary_en": "Company founded in 2026.",
    "description_es": "Innovacion tecnologica.",
    "description_en": "Tech innovation."
}'

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/ingest-event" `
        -Method Post `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $body
    Write-Host "--- SUCCESS ---" -ForegroundColor Green
    $response | Format-List
} catch {
    Write-Host "--- ERROR ---" -ForegroundColor Red
    $_.Exception.Message
}
