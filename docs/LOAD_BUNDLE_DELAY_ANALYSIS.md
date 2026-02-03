# loadBundle delay (0.5s vs 0.3s) 테스트 실패 원인 분석

## 배경

`ios/CodePush/CodePush.m`의 `loadBundle`에서 Fabric 초기화 레이스 컨디션 방지를 위해 **0.5초** 지연 후 `RCTTriggerReloadCommandListeners`를 호출하고 있음.  
이 때 **0.5초**면 테스트가 실패하고, **0.3초**로 줄이면 통과함.

## 관련 코드 요약

### 1. CodePush.m (545–552)

- `loadBundle`은 `dispatch_async(main_queue)` 안에서:
  - `RCTReloadCommandSetBundleURL` 호출
  - `dispatch_after(0.5초, main_queue)`로 지연 후 `RCTTriggerReloadCommandListeners(@"react-native-code-push: Restart")` 호출
- 주석: RN 0.82+ New Architecture에서 RCTInstance invalidate와 RCTFabricSurface start가 동시에 돌면서 MountingCoordinator mutex가 destroy된 뒤 접근되어 크래시가 나는 레이스를 피하기 위한 지연.

### 2. 실패하는 테스트

- **localPackage.install.revert.dorevert** (ScenarioInstallWithRevert + UpdateDeviceReady)
- 시나리오: `checkAndInstall(IMMEDIATE)` → 업데이트 설치 → 네이티브에서 `loadBundle()` 호출 → 지연 후 리로드 → 새 번들(updateDeviceReady.js)에서 `readyAfterUpdate()` → 서버로 `DEVICE_READY_AFTER_UPDATE` 전송
- 테스트 기대 메시지 순서: `CHECK_UPDATE_AVAILABLE` → `DOWNLOAD_SUCCEEDED` → `DEVICE_READY_AFTER_UPDATE` (3개만, SYNC_STATUS 없음)

### 3. 테스트/프레임워크

- `expectTestMessages()`: 타임아웃 없이 메시지 순서만 검사 (전체 테스트 타임아웃 20분)
- `serverUtil.js`: 연속 중복 메시지는 무시 (`lastRequestBody`와 동일하면 카운트 안 함)
- 리로드 후 새 번들이 로드되어 `componentDidMount` → `readyAfterUpdate()` → `DEVICE_READY_AFTER_UPDATE` 전송

## 가설

### 가설 1: “리로드 유효 시간 창” (Reload validity window) — **가장 유력**

- **내용**: 리로드를 **너무 일찍** 하면 Fabric 미준비로 크래시, **너무 늦게** 하면 이미 브릿지/리스너가 정리되어 리로드가 동작하지 않거나 크래시.
- **근거**:
  - 주석대로 “Fabric surface 초기화가 끝난 뒤”에 리로드를 해야 하므로 **최소 지연**이 필요.
  - RN 0.82+ New Architecture에서는 인스턴스/리로드 리스너가 “일시적”일 수 있고, 일정 시간(예: ~0.4초) 이후에는 리로드 명령이 무시되거나 잘못된 상태 접근으로 크래시할 수 있음.
- **예상**:
  - 0.3초: Fabric은 준비됐고, 리로드 리스너/브릿지도 아직 유효 → 리로드 성공 → `DEVICE_READY_AFTER_UPDATE` 도착 → 테스트 통과.
  - 0.5초: Fabric은 오래 전에 준비됐지만, 그 사이 RCT 쪽에서 무언가 정리/전환되어 `RCTTriggerReloadCommandListeners` 호출 시 리로드가 실패하거나 크래시 → `DEVICE_READY_AFTER_UPDATE` 미도착 → 테스트 실패(또는 타임아웃).

### 가설 2: 테스트/앱 측 타이밍 (메시지 순서 또는 중복)

- **내용**: 0.5초 지연으로 인해 “리로드 완료 시점”이 늦어지고, 그 사이 다른 메시지가 먼저 오거나 중복 처리 로직과 맞물려 기대 순서와 어긋남.
- **검토 결과**:  
  - 이 테스트는 `checkAndInstall`만 사용하고 `sync()`를 쓰지 않아 `SYNC_STATUS`는 기대 메시지에 없음.  
  - `expectTestMessages`는 3개만 기대하고, 중복은 “연속 동일 메시지”만 무시하므로, **0.5초만으로 메시지 순서가 바뀌는 직접적인 경로는 코드상 보이지 않음.**  
  - 다만 CI/에뮬레이터 지연으로 “리로드가 0.5초보다 훨씬 늦게 끝나고, 그 전에 다른 로그/메시지가 끼어든다” 같은 변수는 배제할 수 없음.

### 가설 3: RN/시뮬레이터 내부 타임아웃 또는 정리

- **내용**: RN 또는 iOS 시뮬레이터 쪽에 “리로드 대기”나 “인스턴스 유지”와 관련된 짧은 타임아웃(예: 300–500ms 구간)이 있어, 0.5초일 때는 이미 만료된 뒤라 리로드가 no-op이 되거나 예외가 발생.
- **근거**: 코드베이스 내에서는 해당 값(0.3/0.4/0.5초)을 쓰는 다른 지점을 찾지 못했고, RN/시뮬레이터 내부 동작에 의존하는 설명이 됨. 검증하려면 RN 0.82 소스에서 `RCTTriggerReloadCommandListeners` / ReloadCommand / Fabric 생명주기 주변 타이밍을 확인해야 함.

## 권장 조치

1. **단기**:  
   - 현재 0.3초로 통과하는 것이 확인됐다면, **0.3초로 고정**하는 것이 테스트 안정성 측면에서 합리적.  
   - 주석에 “0.5초는 테스트 환경에서 지나치게 길어 실패할 수 있음. 0.3초는 Fabric 준비와 리로드 유효 창 내에 있음” 정도를 남기면 이후 유지보수에 도움이 됨.
2. **중기**:  
   - RN 0.82+에서 ReloadCommand / Fabric surface 생명주기와 “리로드 가능 구간”이 문서/소스에 있는지 확인.  
   - 가능하면 “Fabric 준비 완료” 같은 이벤트나 API가 있는지 보고, `dispatch_after` 대신 **이벤트 기반**으로 리로드 시점을 맞추는 방안 검토.
3. **검증**:  
   - 0.25초, 0.35초, 0.45초 등으로 바꿔 보며 **실패↔통과가 바뀌는 경계**를 찾으면, “리로드 유효 창” 가설을 더 확실히 할 수 있음.

## 요약

- **0.5초 실패 / 0.3초 성공**의 가장 설득력 있는 설명은, **리로드를 트리거해도 되는 “유효한 시간 창”이 있고, 0.3초는 그 안에 있지만 0.5초는 그 창을 지나서** 리로드가 실패하거나 크래시하는 경우(가설 1)이다.
- 테스트 코드와 메시지 순서만 보면 0.5초에서 “잘못된 메시지가 먼저 온다”는 직접적인 경로는 없어, **네이티브 리로드 동작 자체의 타이밍**이 원인일 가능성이 크다.
