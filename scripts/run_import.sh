#!/bin/bash
set -a
source /var/www/customs-crm/backend/.env
set +a
python3 /var/www/customs-crm/scripts/import_xlsb.py "$1" "$2" >> /var/log/customs-import.log 2>&1 &
