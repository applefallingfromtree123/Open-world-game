// ============================================================
//  초보자 튜토리얼 — 장별 안내 + 음성 읽어주기 (브라우저 TTS)
// ============================================================
import { OUTPOST_KIT_PRICE } from './data.js';

const K = (pc, mob) => `<span class="tk-pc">${pc}</span><span class="tk-mob">${mob}</span>`;

export const CHAPTERS = [
  {
    t: '1. 시작하기',
    h: `<p><b>STARDRIFT</b>는 정해진 이야기가 없는 우주 샌드박스입니다. 상인, 광부, 현상금 사냥꾼, 탐험가, 해적… 무엇이 될지는 전적으로 당신이 정합니다.</p>
    <p>처음에는 <b>8,000 크레딧(Cr)</b>과 작은 전투정 <b>스패로</b> 한 척으로 시작합니다. 목표는 단순합니다. <b>돈을 벌어서 → 더 좋은 장비와 함선을 사고 → 더 큰 돈을 버는 것</b>.</p>
    <h4>화면 보는 법</h4>
    <ul>
      <li><b>위 가운데</b>: 지금 있는 성계 이름, 보안 등급, 지배 세력.</li>
      <li><b>왼쪽 위 항법 패널</b>: 가까운 스테이션·행성·소행성대·신호원 목록. 누르면 그곳이 <b>목표</b>가 됩니다.</li>
      <li><b>오른쪽 위</b>: 보유 크레딧, 메뉴, 은하 지도. 목표를 잡으면 그 아래에 목표 정보가 나옵니다.</li>
      <li><b>아래 가운데 레이더</b>: 주변 함선. 빨강=적, 파랑=보안군, 초록=아군, 흰색=중립, 보라=다른 플레이어.</li>
      <li><b>레이더 왼쪽</b>: 실드(파랑), 선체(주황), 에너지(보라), 연료(초록). <b>레이더 오른쪽</b>: 속도와 스로틀.</li>
    </ul>
    <p class="tip">이 튜토리얼은 언제든 <b>메뉴 → 설정 → 초보자 튜토리얼</b> 또는 <b>메뉴 → 튜토리얼</b>에서 다시 볼 수 있고, 🔊 버튼으로 읽어달라고 할 수 있습니다.</p>`,
  },
  {
    t: '2. 조작법 (PC)',
    h: `<p>PC에서는 <b>마우스로 방향</b>을 잡고 <b>키보드로 속도와 기능</b>을 씁니다. 먼저 화면을 한 번 클릭해야 마우스 조종이 시작됩니다.</p>
    <ul>
      <li><b>마우스</b>: 기수가 향하는 방향. 화면 가운데에서 멀리 움직일수록 빠르게 돕니다.</li>
      <li><b>W / S</b>: 스로틀(속도) 올리기 / 내리기. <b>X</b>는 스로틀 0 (정지).</li>
      <li><b>A / D</b>: 좌우 평행이동, <b>R / F</b>: 위아래 평행이동, <b>Q / E</b>: 기체 굴리기(롤).</li>
      <li><b>Shift</b>: 부스트 (에너지 소모). <b>Z</b>: 비행 보조 끄기/켜기 — 끄면 관성으로 미끄러집니다. 처음엔 켠 채로 두세요.</li>
      <li><b>왼쪽 클릭</b>: 주무기 발사(채굴 레이저 포함). <b>오른쪽 클릭</b>: 미사일.</li>
      <li><b>T</b>: 정면의 대상을 목표로 잡기, <b>Y</b>: 가장 가까운 적, <b>Tab</b>: 목표 바꾸기.</li>
      <li><b>G</b>: 자동 비행 — 목표까지 알아서 날아가고, 스테이션이면 <b>자동 도킹</b>까지 합니다. 신호원 근처에서는 회수.</li>
      <li><b>J</b>: 크루즈 드라이브(성계 안 고속 이동). <b>M</b>: 은하 지도. <b>H</b>: 하이퍼점프(다른 성계로).</li>
      <li><b>V</b>(누르고 있기): 행성 탐사 스캔. <b>C</b>: 시점 바꾸기. <b>휠</b>: 카메라 거리. <b>Alt</b>: 둘러보기.</li>
      <li><b>Enter</b>: 채팅, <b>ESC</b>: 메뉴 / 오토파일럿·점프 취소.</li>
    </ul>`,
  },
  {
    t: '3. 조작법 (모바일)',
    h: `<p>모바일은 <b>가로 화면</b>에서 양손 엄지로 조작합니다.</p>
    <ul>
      <li><b>왼쪽 화면 아무 곳</b>을 누른 채 밀기: 조종 스틱. 누른 자리가 중심이 됩니다. 손을 떼면 직진합니다.</li>
      <li><b>⟲ ⟳ 버튼</b>(왼쪽): 기체 굴리기(롤).</li>
      <li><b>오른쪽 끝 세로 막대</b>: 스로틀. 위로 끌수록 빠르고, 흰 선이 정지, 그 아래는 후진.</li>
      <li><b>발사</b>(빨간 큰 버튼), <b>미사일</b>, <b>부스트</b> 버튼.</li>
      <li><b>평행이동 패드</b>(오른쪽 위 원): 좌우로 밀면 옆으로, 위아래로 밀면 위아래로 이동.</li>
      <li><b>위쪽 버튼 줄</b>: 크루즈 · 자동 도킹(자동 비행/회수) · 점프 · 표적 · 적 · 스캔(누르고 있기) · 시점 · 관성 · 정지 · 채팅.</li>
      <li>점프 버튼을 <b>길게 누르면</b> 점프 취소입니다.</li>
    </ul>
    <p class="tip">설정에서 조작 기기(PC/모바일)를 언제든 바꿀 수 있습니다.</p>`,
  },
  {
    t: '4. 비행의 기초',
    h: `<h4>출항과 도킹</h4>
    <p>스테이션에 있을 때 <b>▶ 출항</b>을 누르면 우주로 나갑니다. 돌아올 때는 항법 패널에서 스테이션을 누르고 ${K('<b>G</b>', '<b>[자동 도킹]</b>')}를 누르면 끝입니다. 컴퓨터가 입구까지 몰고 들어가 도킹합니다. 입구(초록·빨강 불빛 사이)로 천천히 직접 들어가도 도킹됩니다.</p>
    <h4>스로틀</h4>
    <p>스로틀은 <b>원하는 속도</b>입니다. 한 번 올려두면 그 속도를 유지합니다. 스로틀 막대의 파란 표시 구간(50~75%)이 선회가 가장 잘 되는 속도입니다.</p>
    <h4>크루즈 드라이브 — 성계 안의 먼 거리</h4>
    <p>행성 사이는 수십~수백 km입니다. 목표를 정면에 두고 ${K('<b>J</b>', '<b>[크루즈]</b>')}를 누르면 3초 충전 후 초당 수십 km로 날아갑니다. <b>목표를 정면에 두고 있으면 도착할 때 알아서 감속</b>하고 근처에서 크루즈가 풀립니다. 다시 누르면 언제든 해제됩니다.</p>
    <h4>질량 고정</h4>
    <p>스테이션 3km 이내, 행성 바로 옆, 항성 근처, 적대 대형 함선 근처에서는 크루즈와 하이퍼점프 충전이 <b>멈춥니다</b>. 화면 가운데에 이유와 남은 거리가 표시되니 조금 멀리 날아가면 됩니다. 점프를 누른 상태라면 자동으로 빠져나갑니다.</p>
    <p class="tip">가장 쉬운 이동법: 항법 패널에서 목적지를 누르고 ${K('<b>G</b>', '<b>[자동 도킹]</b>')} 한 번. 크루즈·감속·도킹까지 전부 자동입니다.</p>`,
  },
  {
    t: '5. 첫 돈 벌기 (완전 초보 루트)',
    h: `<p>아래 순서를 그대로 따라 하면 무리 없이 첫 수십만 크레딧을 모을 수 있습니다.</p>
    <h4>1단계 — 임무 게시판 (위험 거의 없음)</h4>
    <ol>
      <li>스테이션에서 <b>임무</b> 탭을 엽니다.</li>
      <li><b>데이터 운송</b>(화물칸을 안 씀)이나 같은 성계 안의 <b>배송</b> 임무를 수락합니다.</li>
      <li>메뉴 → 임무에서 <b>항법 목표</b>(같은 성계) 또는 <b>경로 설정</b>(다른 성계)을 누르고, 목표 스테이션에 도킹하면 자동 완료됩니다.</li>
    </ol>
    <p>건당 수천 크레딧이고, 해당 세력의 평판도 오릅니다. 게시판은 15분마다 바뀝니다.</p>
    <h4>2단계 — 무역 (가장 기본적인 돈벌이)</h4>
    <ol>
      <li><b>시장</b> 탭에서 <span class="g">생산</span> 표시가 붙은 상품은 <b>싸게 살 수 있는</b> 상품입니다.</li>
      <li>다른 스테이션 시장에서 같은 상품에 <span class="y">수요</span> 표시가 있으면 <b>비싸게 팝니다</b>.</li>
      <li>초록색 가격 = 유리한 가격, 빨간색 = 불리한 가격. 많이 팔수록 시세가 떨어지니 여러 곳에 나눠 파세요.</li>
    </ol>
    <p>스테이션 종류별 특징: 무역 허브는 사치품·식량·의약품을 팔고 전자부품·기계를 삽니다. 산업 단지는 합금·기계를 팔고 광석을 삽니다. 연구 기지는 전자부품·AI 코어를 팔고 희귀 광물·유물을 삽니다. 농업 위성은 식량·물을 팔고, 채굴 콜로니는 식량·물·의약품을 삽니다.</p>
    <h4>3단계 — 채굴 (안정적인 수입)</h4>
    <ol>
      <li><b>장비</b> 탭에서 두 번째 무기를 <b>채굴 레이저 S</b>(1,800 Cr)로 바꿉니다. 옵션 슬롯에 <b>화물칸 확장</b>(1,500 Cr)을 더 달면 좋습니다.</li>
      <li>항법 패널에서 <b>소행성대</b>를 골라 자동 비행으로 갑니다.</li>
      <li>소행성 하나에 200~300m까지 다가가 정면에 두고 발사를 누르고 있으면 광석이 화물칸에 쌓입니다.</li>
      <li>가득 차면 산업 단지나 '수요' 표시가 있는 스테이션에 팝니다.</li>
    </ol>
    <p>보안이 낮은 성계일수록 백금·페인석·공허 수정 같은 비싼 광물이 나오지만 해적도 많습니다.</p>
    <h4>4단계 — 탐사와 신호원 (덤으로 버는 돈)</h4>
    <ul>
      <li>행성·항성을 목표로 잡고 가까이 가서 ${K('<b>V</b>를 누르고 있으면', '<b>[스캔]</b>을 누르고 있으면')} 탐사 데이터가 생깁니다. 생명 행성은 22,000 Cr짜리입니다! 스테이션 <b>서비스</b> 탭에서 판매합니다.</li>
      <li>처음 가보는 성계에 들어가면 방문 보너스, 은하 최초 발견이면 추가 보너스가 있습니다.</li>
      <li>항법 패널의 주황 ◆ <b>난파선 잔해</b>에 가서 ${K('<b>G</b>', '<b>[자동 도킹]</b>')}를 누르면 화물이 튀어나옵니다. 천천히 다가가면 자동으로 주워집니다.</li>
    </ul>
    <h4>5단계 — 함선 업그레이드</h4>
    <p>돈이 모이면 <b>조선소</b>에서 목적에 맞는 배를 사세요. 무역 → <b>아틀라스</b>(95,000), 채굴 → <b>프로스펙터</b>(62,000), 전투 → <b>케스트렐</b>(48,000) / <b>맨티스</b>(135,000), 탐험 → <b>노매드</b>(165,000). 보상판매를 쓰면 지금 배 값의 85%를 빼줍니다.</p>
    <p class="tip">초보 추천 순서: 임무 몇 개 → 채굴 레이저 달고 채굴 → 프로스펙터 구매 후 화물칸 가득 달기 → 저보안 성계의 비싼 광물 → 아틀라스로 대량 무역.</p>`,
  },
  {
    t: '6. 장비와 함선 키우기',
    h: `<ul>
      <li><b>무기(하드포인트)</b>: S/M/L 크기. 큰 슬롯에는 작은 무기도 달 수 있지만 큰 무기가 훨씬 셉니다.
        <br>펄스 레이저 = 실드에 강함, 멀티캐논 = 선체에 강함, 플라즈마 = 느리지만 강력, 레일건 = 즉시 명중, 미사일 = 유도(표적 필요), 채굴 레이저 = 채굴용.</li>
      <li><b>코어 모듈</b> 1~5등급: 쉴드, 추진기(속도), 동력로(에너지), <b>하이퍼드라이브(점프 거리)</b>, 장갑. 먼 성계로 가고 싶으면 하이퍼드라이브부터 올리세요.</li>
      <li><b>옵션 슬롯</b>: 화물칸 확장, 보조 연료 탱크, <b>연료 스쿠프</b>(항성 근처에서 연료 자동 보급), 장갑판, 쉴드 부스터, 정밀 스캐너(탐사 가치 2배), 광물 정제기(채굴 +60%), ECM(미사일 교란).</li>
      <li>장비를 팔면 80%를 돌려받습니다. <b>함대</b> 탭에서 여러 척을 보유하고, 다른 스테이션의 배를 운송해 올 수 있습니다.</li>
      <li><b>서비스</b> 탭: 선체 수리, 연료 보급, 미사일 재장전.</li>
    </ul>`,
  },
  {
    t: '7. 세력과 보안 등급',
    h: `<h4>세력</h4>
    <ul>
      <li><b style="color:#5cc8ff">태양 연합</b>: 은하 중심의 거대 연방. 보안이 철저하고, 무기류도 불법입니다. 시작 성계 솔라리스가 수도입니다.</li>
      <li><b style="color:#7dff9a">자유 행성 동맹</b>: 개척자와 광부의 세력. 채굴하기 좋은 곳이 많습니다.</li>
      <li><b style="color:#ffb347">코어 신디케이트</b>: 기업 세력. 연구·산업 스테이션이 많습니다.</li>
      <li><b style="color:#ff4057">붉은 송곳니</b>: 해적. 무법지대를 지배합니다. 해적 소굴에서만 마약·밀입국자 같은 불법품을 사고팝니다.</li>
      <li><b>무소속</b>: 어느 편도 아닌 정착지. 벌금 정산이 가능합니다.</li>
    </ul>
    <h4>평판</h4>
    <p>임무를 완료하고 해적을 잡으면 평판이 오르고, 무고한 배를 공격하면 떨어집니다. 평판이 높으면 시장 가격이 유리해지고, <b>−60 이하(적대)</b>가 되면 그 세력의 보안군이 공격하고 도킹을 거부합니다. 해적 평판이 <b>+25(우호)</b> 이상이면 해적이 당신을 공격하지 않습니다. 메뉴 → 세력에서 확인하세요.</p>
    <h4>보안 등급</h4>
    <ul>
      <li><b style="color:#5dff9d">고보안</b>: 보안군이 많고 해적이 드뭅니다. 초보자에게 안전.</li>
      <li><b style="color:#ffe066">중보안</b> / <b style="color:#ff9a3c">저보안</b>: 해적이 늘고 광물이 비싸집니다. 저보안부터는 크루즈 중 해적에게 끌려 나올 수 있습니다(인터딕션).</li>
      <li><b style="color:#ff3355">무법지대</b>: 보안군이 없습니다. 가장 비싼 광물과 위험. 플레이어끼리의 전투(PvP)는 저보안과 무법지대에서만 가능합니다.</li>
    </ul>`,
  },
  {
    t: '8. 범죄와 현상금',
    h: `<ul>
      <li>보안 성계에서 상선·광부·보안군 같은 <b>무고한 함선을 쏘면 '폭행'</b>, 격추하면 <b>'살인'</b>으로 수배되고 그 세력의 현상금이 붙습니다.</li>
      <li>수배 중이면 그 세력의 보안군이 공격하고, 그 세력 스테이션은 도킹을 거부합니다. 현상금이 커지면 <b>현상금 사냥꾼</b>이 찾아옵니다.</li>
      <li>벌금은 <b>무소속 스테이션, 해적 소굴, 개인 기지</b>의 서비스 탭에서 정산할 수 있습니다(수수료 25%).</li>
      <li>불법 화물(마약·밀입국자, 연합에서는 무기류)을 싣고 보안군 근처에 있으면 <b>스캔당해 압수 + 벌금</b>입니다.</li>
      <li>반대로 <b>해적</b>(빨간색, 현상금 표시)을 격추하면 즉시 현상금을 받습니다. 해적 성계에서는 현상금이 지급되지 않습니다.</li>
    </ul>
    <p class="tip">해적이 되고 싶다면: 저보안·무법지대에서 상선을 공격해 떨어진 화물을 줍고, 해적 소굴에서 팔면 됩니다. 단, 쫓기는 삶을 각오하세요.</p>`,
  },
  {
    t: '9. 다른 성계로 가기 (하이퍼점프)',
    h: `<ol>
      <li>${K('<b>M</b>', '<b>[지도]</b>')}으로 은하 지도를 엽니다. 드래그로 돌리고 ${K('휠', '두 손가락')}로 확대합니다.</li>
      <li>가고 싶은 성계를 <b>클릭(탭)</b>하면 노란 경로가 그려집니다. 초록 점선 원이 한 번에 갈 수 있는 거리입니다.</li>
      <li>${K('<b>H</b>', '<b>[점프]</b>')} 또는 지도 오른쪽의 <b>▶ 하이퍼점프</b>를 누르면 4초 충전 후 점프합니다. 경로가 여러 번이면 도착할 때마다 다시 누르세요.</li>
    </ol>
    <h4>점프가 안 될 때</h4>
    <ul>
      <li><b>질량 고정</b>: 스테이션·행성·적대 대형 함선 근처. 화면 가운데에 원인과 남은 거리가 나오고, 자동으로 빠져나갑니다. 직접 조작하면 자동 이탈이 잠시 꺼집니다.</li>
      <li><b>연료 부족</b>: 스테이션 서비스 탭에서 보급(톤당 70 Cr). 연료 스쿠프가 있으면 항성 근처에서 공짜로 채웁니다.</li>
      <li><b>거리 부족</b>: 하이퍼드라이브 등급을 올리거나 노매드 같은 장거리 함선을 쓰세요.</li>
      <li>충전 취소는 ${K('<b>ESC</b>', '<b>[점프] 길게 누르기</b>')}.</li>
    </ul>`,
  },
  {
    t: '10. 전투 요령',
    h: `<ul>
      <li>먼저 ${K('<b>T</b>(정면)나 <b>Y</b>(가장 가까운 적)', '<b>[표적]</b>이나 <b>[적]</b>')}으로 목표를 잡으세요. 목표를 잡으면 무기가 <b>예측 사격 지점(흰 원)</b>을 자동으로 보정합니다. 흰 원을 조준선에 겹치면 맞습니다.</li>
      <li>실드(파랑)가 먼저 깎이고, 실드가 0이 되면 선체(주황)가 깎입니다. 실드는 4초간 맞지 않으면 다시 찹니다.</li>
      <li>적이 너무 가까우면 스로틀을 50~75%로 낮추면 더 잘 돕니다. 부스트로 거리를 벌릴 수 있습니다.</li>
      <li>선체가 위험하면 크루즈(${K('J', '[크루즈]')})로 도망치세요. 질량 고정이 아니면 탈출할 수 있습니다.</li>
      <li>격추되면 화물을 잃고 마지막 도킹 스테이션에서 깨어납니다. <b>보험금</b>(배 값의 6%)을 내면 같은 배를 돌려받습니다. 스패로는 무료입니다.</li>
    </ul>
    <p class="tip">초보자는 고보안 성계의 교전 지역(주황 ◆)에서 보안군과 함께 싸우면 안전하게 현상금을 벌 수 있습니다.</p>`,
  },
  {
    t: '11. 개인 기지와 용병',
    h: `<h4>개인 기지</h4>
    <ol>
      <li>산업 단지·군사 요새·해적 소굴의 서비스 탭에서 <b>기지 건설 키트</b>(${OUTPOST_KIT_PRICE.toLocaleString()} Cr)를 삽니다.</li>
      <li>다른 스테이션에서 20km 이상 떨어진 원하는 곳에서 ${K('<b>B</b>', '<b>[기지]</b>')}를 누르면 건설됩니다.</li>
      <li>도킹 후 <b>기지 관리</b>에서 모듈을 짓습니다. 자동 정제소는 시간당 수익을 만들고, <b>접속하지 않는 동안에도 최대 72시간까지 쌓입니다</b>. 소행성대 40km 이내면 50% 보너스.</li>
      <li>보관함에는 화물을 무제한 보관할 수 있고, 방어 포탑은 다가오는 해적을 쏩니다.</li>
    </ol>
    <h4>용병 윙맨</h4>
    <p>군사 요새의 <b>용병</b> 탭에서 고용합니다. 1시간(실제 시간) 동안 당신을 따라다니며 목표를 공격하고, 점프도 함께합니다. 최대 2명.</p>`,
  },
  {
    t: '12. 멀티플레이와 저장',
    h: `<ul>
      <li>계정으로 접속하면 같은 성계의 다른 파일럿이 보라색으로 보이고 채팅할 수 있습니다. ${K('Enter', '[채팅]')}로 입력, 앞에 <b>/s</b>를 붙이면 같은 성계에만 보냅니다.</li>
      <li>진행 상황은 자동으로 서버와 브라우저에 저장됩니다(도킹할 때, 그리고 주기적으로).</li>
      <li>메뉴 → 랭킹에서 총 자산 순위를 볼 수 있습니다.</li>
      <li>오프라인 플레이는 이 브라우저에만 저장됩니다.</li>
    </ul>
    <p class="tip">이제 준비 끝! 막히면 언제든 이 튜토리얼을 다시 열어보세요. 즐거운 비행 되세요, 파일럿.</p>`,
  },
];

let el, cur = 0, game, speaking = false;
export function initTutorial(g) {
  game = g;
  el = document.createElement('div');
  el.id = 'tutorial';
  el.className = 'window hidden';
  el.innerHTML = `<div class="win-head"><div class="win-title">초보자 튜토리얼</div>
      <div class="flex"><button class="btn small" id="tu-say">🔊 읽어주기</button><button class="btn" id="tu-close">✕ 닫기</button></div></div>
    <div class="tu-wrap"><div class="tu-list"></div><div class="tu-body"></div></div>
    <div class="tu-foot"><button class="btn" id="tu-prev">◀ 이전</button><span id="tu-page"></span><button class="btn primary" id="tu-next">다음 ▶</button></div>`;
  document.body.appendChild(el);
  el.querySelector('.tu-list').innerHTML = CHAPTERS.map((c, i) => `<button data-i="${i}">${c.t}</button>`).join('');
  el.querySelectorAll('.tu-list button').forEach((b) => b.onclick = () => show(+b.dataset.i));
  el.querySelector('#tu-prev').onclick = () => show(Math.max(0, cur - 1));
  el.querySelector('#tu-next').onclick = () => (cur < CHAPTERS.length - 1 ? show(cur + 1) : closeTutorial());
  el.querySelector('#tu-close').onclick = () => closeTutorial();
  el.querySelector('#tu-say').onclick = () => (speaking ? stopSpeak() : speak());
  if (!('speechSynthesis' in window)) el.querySelector('#tu-say').classList.add('hidden');
}
function show(i) {
  const keepSpeaking = speaking;
  stopSpeak();
  cur = i;
  el.querySelectorAll('.tu-list button').forEach((b, k) => b.classList.toggle('active', k === i));
  const body = el.querySelector('.tu-body');
  body.innerHTML = `<h3>${CHAPTERS[i].t}</h3>${CHAPTERS[i].h}`;
  body.scrollTop = 0;
  el.querySelector('#tu-page').textContent = `${i + 1} / ${CHAPTERS.length}`;
  el.querySelector('#tu-next').textContent = i < CHAPTERS.length - 1 ? '다음 ▶' : '완료 ✓';
  if (keepSpeaking) speak();
}
export function openTutorial(i = 0) {
  game.menuOpen = true;
  game.tutorialOpen = true;
  document.getElementById('menu').classList.add('hidden');
  el.classList.remove('hidden');
  show(i);
}
export function closeTutorial() {
  stopSpeak();
  el.classList.add('hidden');
  game.tutorialOpen = false;
  game.menuOpen = false;
  if (game.save) { game.save.tutorialDone = true; game.dirty(); }
}
export const tutorialOpen = () => el && !el.classList.contains('hidden');

// ---------- 음성 읽어주기 ----------
function speechText() {
  const body = el.querySelector('.tu-body').cloneNode(true);
  // 현재 기기에 맞지 않는 조작 설명 제거
  const mobile = document.body.classList.contains('mobile');
  body.querySelectorAll(mobile ? '.tk-pc' : '.tk-mob').forEach((n) => n.remove());
  body.querySelectorAll('li, p, h3, h4').forEach((n) => n.append('. '));
  return body.textContent.replace(/[◆▶◀✓⟲⟳🔊]/g, ' ').replace(/Cr/g, '크레딧').replace(/\s+/g, ' ').replace(/(\. )+/g, '. ').trim();
}
function speak() {
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  // 긴 글은 문장 단위로 나눠 읽기 (일부 브라우저의 길이 제한 대응)
  const parts = speechText().split(/(?<=[.!?])\s+/).reduce((acc, s) => {
    if (acc.length && (acc[acc.length - 1] + ' ' + s).length < 180) acc[acc.length - 1] += ' ' + s; else acc.push(s);
    return acc;
  }, []);
  const voice = synth.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('ko'));
  speaking = true;
  el.querySelector('#tu-say').textContent = '■ 멈추기';
  parts.forEach((p, k) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = 'ko-KR'; u.rate = 1.05; if (voice) u.voice = voice;
    if (k === parts.length - 1) u.onend = () => { speaking = false; const b = el.querySelector('#tu-say'); if (b) b.textContent = '🔊 읽어주기'; };
    synth.speak(u);
  });
}
function stopSpeak() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  speaking = false;
  const b = el && el.querySelector('#tu-say'); if (b) b.textContent = '🔊 읽어주기';
}
