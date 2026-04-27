# 배포 가이드 (Render.com)

## 1단계 — GitHub 저장소 생성

1. github.com 접속 → New Repository
2. 저장소 이름: `excel-card-game` (비공개 권장)
3. 로컬에서 실행:
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/excel-card-game.git
git push -u origin main
```

## 2단계 — Render.com 배포

1. render.com → 회원가입 (GitHub 연동)
2. Dashboard → **New +** → **Web Service**
3. GitHub 저장소 선택 → Connect
4. 설정:
   - **Name**: excel-card-game
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
5. **Create Web Service** 클릭

배포 완료 후 `https://excel-card-game.onrender.com` 형태의 URL이 생성됩니다.

## 주의사항

- 무료 티어는 15분 비활성 후 슬립 (첫 접속 시 30초 대기)
- 서버 재시작 시 방/게임 데이터 초기화 (인메모리)
- HTTPS로 자동 제공됨 (Socket.io 호환)
