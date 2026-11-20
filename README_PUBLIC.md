# MySocial 4.1 — 무료 공개 배포 준비

## 무료 구성 (Supabase 미사용)
- Render Free: Express 웹 서버
- Neon Free: PostgreSQL 계정/메시지/그룹/세션 데이터 저장
- Cloudinary Free: 이미지 및 릴스 영상 파일 저장

## 필수 환경변수
`NODE_ENV=production`, `SESSION_SECRET`, `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

`SESSION_SECRET`은 길고 임의적인 값으로 설정하세요. 비밀 키를 GitHub 저장소나 코드에 올리지 마세요.

## Render 배포
1. GitHub에 이 폴더의 파일을 저장소로 올립니다. `.env` 파일이나 비밀 키는 올리지 않습니다.
2. Neon에서 무료 PostgreSQL 프로젝트를 만들고 pooled connection string을 복사합니다.
3. Cloudinary에서 무료 계정을 만들고 Cloud Name, API Key, API Secret을 확인합니다.
4. Render에서 New > Blueprint로 GitHub 저장소를 연결하면 `render.yaml` 설정을 읽습니다. 또는 Web Service로 만들고 Build=`npm install`, Start=`npm start`로 설정합니다.
5. Render 환경변수에 Neon의 `DATABASE_URL`과 Cloudinary 세 값을 입력합니다. `SESSION_SECRET`은 Render에서 생성된 값을 사용합니다.
6. 배포 후 `/api/health`에서 `storage: postgresql`, `media: cloudinary`인지 확인합니다.

## 중요 제한
Render Free 웹 서비스는 15분 유휴 후 잠들고 다음 접속 때 약 1분 정도 깨어나는 시간이 생길 수 있습니다. 로컬 파일은 재배포/재시작/수면 시 사라질 수 있으므로 공개 배포에서는 PostgreSQL과 Cloudinary 설정이 필수입니다. Neon Free는 월별 사용량 제한이 있고 유휴 시 compute가 자동 정지합니다. Cloudinary Free는 월 25 크레딧 제한입니다. 무료 구성은 테스트/초기 공개용이며 상업용 또는 안정적인 상시 서비스로 보장되지 않습니다.

## 로컬 개발
`npm install` 후 `npm start`. `DATABASE_URL`이 없으면 로컬 JSON 저장소를 사용합니다.
