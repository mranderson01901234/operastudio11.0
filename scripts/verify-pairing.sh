#!/bin/bash
# Verify pairing status in database

DEVICE_ID="${1:-dafed6bc-8157-456e-a24c-7f971dbe26f1}"

echo "=== Checking Device Status ==="
docker exec -it operastudio-11-0-postgres-1 psql -U operastudio -d operastudio -c "
SELECT 
  id,
  status,
  device_name,
  device_public_key,
  paired_at,
  last_seen_at,
  created_at
FROM devices 
WHERE id = '${DEVICE_ID}';
"

echo ""
echo "=== Checking Device Keys ==="
docker exec -it operastudio-11-0-postgres-1 psql -U operastudio -d operastudio -c "
SELECT 
  id,
  device_id,
  public_key,
  expires_at,
  created_at
FROM device_keys 
WHERE device_id = '${DEVICE_ID}'
ORDER BY created_at DESC
LIMIT 3;
"

echo ""
echo "=== Checking Sessions ==="
docker exec -it operastudio-11-0-postgres-1 psql -U operastudio -d operastudio -c "
SELECT 
  id,
  device_id,
  status,
  mode,
  started_at,
  ended_at,
  created_at
FROM local_sessions 
WHERE device_id = '${DEVICE_ID}'
ORDER BY created_at DESC
LIMIT 5;
"

