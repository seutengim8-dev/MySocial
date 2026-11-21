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


## MySocial 4.2 알림 및 통화 개선
- 음성 통화의 초기 ICE 후보를 보관한 뒤 통화 ID 생성 후 전송하도록 수정
- 원격 오디오 재생 실패 시 사용자가 직접 재생할 수 있는 버튼 표시
- 에코 제거·노이즈 억제 마이크 옵션 적용 및 ICE 서버 보강
- 새 메시지 알림음과 수신 전화 벨소리 추가
- 브라우저 내 시계 알람(시간/이름/매일 반복) 추가

주의: 시계 알람은 해당 브라우저에서 사이트가 실행 중일 때 동작합니다. 브라우저 완전 종료, 기기 전원 꺼짐, 강한 절전 상태에서는 울림을 보장하지 않습니다. 완전한 백그라운드/종료 상태 알림에는 별도 푸시 알림 및 서비스 워커 구성과 브라우저별 권한이 필요합니다. 통화는 STUN만으로 모든 네트워크에서 연결을 보장할 수 없으며, 엄격한 NAT/방화벽 환경에서는 TURN 서버가 필요할 수 있습니다.


## MySocial 4.3 알람 및 푸시 설정

- 알람은 계정 기준 PostgreSQL에 저장되므로 로그인한 여러 기기에서 목록이 동기화됩니다.
- 휴대폰/태블릿에서 브라우저의 🔔 버튼을 눌러 알림 권한과 푸시 구독을 허용해야 합니다.
- 푸시 서버 설정: `npx web-push generate-vapid-keys`로 키를 생성한 뒤 Render Environment에 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`를 등록하세요.
- iPhone/iPad는 iOS/iPadOS 16.4 이상에서 사이트를 홈 화면에 추가한 웹 앱으로 실행해야 웹 푸시를 받을 수 있습니다. Android는 지원 브라우저의 알림 권한이 필요합니다.
- Render 무료 웹 서비스가 절전/중단되면 서버의 알람 발송 작업도 실행되지 않을 수 있습니다. 백그라운드 알람의 안정적 보장을 위해서는 항상 실행되는 유료 인스턴스 또는 외부 스케줄러가 필요합니다.
- WebRTC 음성 통화는 STUN만으로 연결되지 않는 일부 네트워크가 있습니다. 안정적인 모바일/통신사 간 통화를 위해 TURN 서버 자격 증명을 별도 구성해야 합니다.


## MySocial 4.4 백그라운드 푸시 알림 보강
- 메시지/그룹 메시지/수신 전화는 서버에서 Web Push로 구독 기기에 전달합니다.
- 수신 전화 푸시는 높은 urgency와 짧은 TTL로 보내며, 알림에 발신자 이름과 전화 확인 동작을 표시합니다.
- 전화 알림을 누르면 MySocial을 열고, 로그인 세션이 유효하면 통화 요청을 확인할 수 있습니다.
- 각 기기에서 로그인 후 🔔 알림 허용/푸시 구독을 각각 완료해야 합니다.
- 웹 푸시는 앱이 닫힌 동안 OS 알림을 표시할 수 있지만, 브라우저/OS의 강제 종료 정책, 절전/집중 모드, 권한, 네트워크에 따라 지연 또는 미수신될 수 있습니다. 웹 푸시만으로 네이티브 전화 앱처럼 지속적인 벨소리나 자동 통화 연결을 보장하지 않습니다.
- iPhone/iPad는 지원 버전에서 홈 화면에 추가한 웹 앱으로 알림을 허용해야 합니다. Android는 푸시 지원 브라우저와 OS 알림 권한이 필요합니다.
