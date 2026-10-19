@echo off
chcp 65001 >nul
echo 지도 서버를 켭니다. 이 창을 닫으면 지도가 꺼집니다.
start "" http://localhost:8000/gap_map.html
python -m http.server 8000 --directory "%~dp0"
