# TIMEBOX 플래너 (Web App)

구글 스프레드시트와 실시간으로 연동되는 타임박스 플래너 웹 애플리케이션입니다.

## 주요 기능
- **실시간 동기화**: 10초마다 구글 시트와 데이터를 주고받습니다.
- **브레인 덤프**: 할 일을 자유롭게 기록하고 체크할 수 있습니다.
- **타임라인**: 30분 단위로 일정을 관리합니다.
- **Top 3 우선순위**: 완료된 할 일 중 상위 3개를 자동으로 추출하여 강조합니다.

## 설치 및 실행 방법

1. **저장소 클론**:
   ```bash
   git clone [저장소 URL]
   ```

2. **필수 라이브러리 설치**:
   ```bash
   pip install -r requirements.txt
   ```

3. **구글 API 설정**:
   - **로컬 실행 시**: `credentials.json` 파일을 루트 디렉토리에 배치합니다.
   - **Vercel 배포 시**: Vercel 프로젝트 설정의 **Environment Variables**에 `GOOGLE_CREDENTIALS_JSON` 항목을 추가하고, `credentials.json` 파일의 전체 내용(JSON 형식)을 값으로 입력합니다.

4. **서버 실행**:
   ```bash
   python app.py
   ```

## 파일 구조
- `app.py`: Flask 백엔드 서버
- `index.html`: 메인 대시보드
- `login.html`: 로그인 및 회원가입 화면
- `main.js`: 프론트엔드 비즈니스 로직
- `style.css`: 테마 및 스타일링
