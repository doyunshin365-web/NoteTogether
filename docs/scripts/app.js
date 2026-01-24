let login_btn = document.querySelector('#login_submit');
let login_div = document.querySelector('.login');
let register_div = document.querySelector('.register');
let main_div = document.querySelector('.main_menu');
let home = document.querySelector('.home');
let note = document.querySelector('.note');
let friends = document.querySelector('.menubar_item.workspace');
let menu = document.querySelector('.menubar_item.menu');
let home_item = document.querySelector('#mainmenu_item1');
let note_item = document.querySelector('#mainmenu_item2');
let friends_item = document.querySelector('#mainmenu_item3');
let menu_item = document.querySelector('#mainmenu_item4');
let register_btn = document.querySelector('#register_submit');
const addNewNoteBtn = document.querySelector('.add_new_note');

// === Cookie Helpers === //
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toGMTString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}


// 전역 변수: 로그인한 사용자 ID (메모리에 저장)
let loggedInUserId = null;
let currentWorkspaces = [];
let currentInvitations = [];
let currentNotes = [];

// === 실시간 협업용 전역 변수 === //
let socket = null;
let currentNoteId = null;
let currentUserId = null;
let myColor = null;
let remoteCursors = new Map(); // userId -> cursor element
let isUpdatingFromRemote = false;
let editorListenersAttached = false;
let contentChangeTimeout = null;
let cursorMoveTimeout = null;


register_link.addEventListener('click', () => {
    login_div.style.display = 'none';
    register_div.style.display = 'block';
});

document.getElementById('back_to_login').addEventListener('click', () => {
    register_div.style.display = 'none';
    login_div.style.display = 'block';
});

register_btn.addEventListener('click', async () => {
    const id = document.querySelector('#id_input_register').value;
    const pw = document.querySelector('#pw_input_register').value;

    if (!id || !pw) {
        alert("아이디와 비밀번호를 입력해주세요.");
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, pw }),
        });

        const data = await response.json();

        if (data.message === "1") {
            alert("회원가입 성공! 로그인 해주세요.");
            register_div.style.display = 'none';
            login_div.style.display = 'block';
        } else {
            alert("회원가입 실패: " + (data.error || "이미 존재하는 아이디입니다."));
        }
    } catch (error) {
        console.error("Register Error:", error);
        alert("서버 오류");
    }
});

async function performLogin(id, pw, isAuto = false) {
    if (!id || !pw) {
        if (!isAuto) alert("아이디와 비밀번호를 입력해주세요.");
        return;
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, pw }),
        });

        const data = await response.json();

        if (data.message === "2") {
            // 로그인 성공
            login_div.style.display = 'none';
            main_div.style.display = 'block';

            localStorage.setItem('user_id', id);
            localStorage.setItem('user_desc', data.desc);
            loggedInUserId = id;

            const usernameEl = document.querySelector('.username');
            if (usernameEl) usernameEl.textContent = id;

            // 쿠키 저장 (id, pw, timestamp)
            setCookie('auto_login_id', id, 365);
            setCookie('auto_login_pw', pw, 365);
            setCookie('auto_login_time', Date.now(), 365);

            initializeSocket();
            loadUserNotes();
            loadWorkspaces();
            loadInvitations();
            return true;
        } else {
            if (!isAuto) {
                if (data.message === "-1") alert("존재하지 않는 아이디입니다.");
                else if (data.message === "-2") alert("비밀번호가 일치하지 않습니다.");
                else alert("로그인 오류가 발생했습니다.");
            }
            return false;
        }
    } catch (error) {
        console.error("Login Error:", error);
        if (!isAuto) alert("서버와 통신 중 오류가 발생했습니다.");
        return false;
    }
}

login_btn.addEventListener('click', async () => {
    const id = document.querySelector('#id_input').value;
    const pw = document.querySelector('#pw_input').value;
    await performLogin(id, pw);
});

// Auto-login on load
window.addEventListener('DOMContentLoaded', async () => {
    const savedId = getCookie('auto_login_id');
    const savedPw = getCookie('auto_login_pw');
    const savedTime = getCookie('auto_login_time');

    if (savedId && savedPw && savedTime) {
        const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const diff = now - parseInt(savedTime);

        if (diff < oneYearInMs) {
            console.log("Attempting auto-login...");
            const success = await performLogin(savedId, savedPw, true);
            if (!success) {
                console.log("Auto-login failed. Please login manually.");
            }
        } else {
            console.log("Auto-login expired (1 year). Please login manually.");
        }
    }
});

function safeDisplay(element, value) {
    if (element) element.style.display = value;
}

if (home_item) {
    home_item.addEventListener('click', () => {
        safeDisplay(home, 'block');
        safeDisplay(note, 'none');
        safeDisplay(friends, 'none');
        safeDisplay(menu, 'none');

        if (home_item) home_item.classList.add('active');
        if (note_item) note_item.classList.remove('active');
        if (friends_item) friends_item.classList.remove('active');
        if (menu_item) menu_item.classList.remove('active');
    });
}

if (note_item) {
    note_item.addEventListener('click', () => {
        safeDisplay(home, 'none');
        safeDisplay(note, 'block');
        safeDisplay(friends, 'none');
        safeDisplay(menu, 'none');

        if (home_item) home_item.classList.remove('active');
        if (note_item) note_item.classList.add('active');
        if (friends_item) friends_item.classList.remove('active');
        if (menu_item) menu_item.classList.remove('active');
    });
}

if (friends_item) {
    friends_item.addEventListener('click', () => {
        safeDisplay(home, 'none');
        safeDisplay(note, 'none');
        safeDisplay(friends, 'block');
        safeDisplay(menu, 'none');

        if (home_item) home_item.classList.remove('active');
        if (note_item) note_item.classList.remove('active');
        if (friends_item) friends_item.classList.add('active');
        if (menu_item) menu_item.classList.remove('active');
    });
}

if (menu_item) {
    menu_item.addEventListener('click', () => {
        safeDisplay(home, 'none');
        safeDisplay(note, 'none');
        safeDisplay(friends, 'none');
        safeDisplay(menu, 'block');

        if (home_item) home_item.classList.remove('active');
        if (note_item) note_item.classList.remove('active');
        if (friends_item) friends_item.classList.remove('active');
        if (menu_item) menu_item.classList.add('active');
    });
}

// === 리본 메뉴 탭 전환 === //
const headerItems = document.querySelectorAll('.editor_header .menu_item');
const contentItems = document.querySelectorAll('.menu_item_content');

headerItems.forEach(item => {
    item.addEventListener('click', () => {
        // 모든 탭 비활성화
        headerItems.forEach(i => i.classList.remove('active'));
        contentItems.forEach(c => c.style.display = 'none');

        // 클릭된 탭 활성화
        item.classList.add('active');

        // 연결된 콘텐츠 보여주기
        const contentClass = item.className.split(' ')[1].replace('_item', '_content');
        const targetContent = document.querySelector('.' + contentClass);
        if (targetContent) targetContent.style.display = 'flex';

        // home_content 또는 help_content가 보이면 스타일 버튼 초기화
        if (contentClass === 'home_content' || contentClass === 'help_content') {
            setTimeout(() => initStyleButtons(), 10);
        }
    });
});

// === 에디터 내용 가져오기 === //
const editor = document.querySelector('.content');

// 마지막 선택 영역 저장
let lastSelectionRange = null;

// 에디터에서 선택이 변경될 때마다 저장
if (editor) {
    editor.addEventListener('mouseup', saveSelection);
    editor.addEventListener('keyup', saveSelection);
    editor.addEventListener('select', saveSelection);
}

// 선택 영역 저장 함수
function saveSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
        const range = selection.getRangeAt(0);
        // Range를 복제하여 저장 (원본은 변경될 수 있으므로)
        lastSelectionRange = range.cloneRange();
    }
}

// === 에디터에 포커스 주기 === //
function focusEditor() {
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

// === 텍스트 삽입 헬퍼 함수 === //
function insertTextAtCursor(text) {
    focusEditor();
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        editor.textContent += text;
    }
}

// === HTML 삽입 헬퍼 함수 === //
function insertHTMLAtCursor(html) {
    focusEditor();
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const fragment = document.createDocumentFragment();
        while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
        }
        range.insertNode(fragment);
        range.setStartAfter(fragment.lastChild);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        editor.innerHTML += html;
    }
}

// === 버튼 기능 예시 === //
const pasteBtn = document.getElementById('pasteBtn');
if (pasteBtn) {
    pasteBtn.addEventListener('click', () => {
        navigator.clipboard.readText().then(text => {
            insertTextAtCursor(text);
        }).catch(err => {
            console.error('클립보드 읽기 실패:', err);
            alert('클립보드 접근에 실패했습니다.');
        });
    });
}

const insertImageBtn = document.getElementById('insertImageBtn');
if (insertImageBtn) {
    insertImageBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = `<img src="${event.target.result}" style="max-width: 100%; height: auto;" /><br>`;
                    insertHTMLAtCursor(img);
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    });
}

const insertShapeBtn = document.getElementById('insertShapeBtn');
if (insertShapeBtn) {
    insertShapeBtn.addEventListener('click', () => {
        const shapeType = prompt("삽입할 도형을 선택하세요 (1: 사각형, 2: 원, 3: 삼각형):", "1");
        let shapeSVG = "";
        let shapeStyle = "width: 100px; height: 100px;"; // Default size

        if (shapeType === "1") {
            shapeSVG = `<svg viewBox="0 0 100 100" style="width:100%; height:100%; display:block;"><rect width="100" height="100" style="fill:#2487ac; stroke-width:0;" /></svg>`;
        } else if (shapeType === "2") {
            shapeSVG = `<svg viewBox="0 0 100 100" style="width:100%; height:100%; display:block;"><circle cx="50" cy="50" r="50" style="fill:#e04f5f; stroke-width:0;" /></svg>`;
        } else if (shapeType === "3") {
            shapeSVG = `<svg viewBox="0 0 100 100" style="width:100%; height:100%; display:block;"><polygon points="50,0 100,100 0,100" style="fill:#66cc66; stroke-width:0;" /></svg>`;
        }

        if (shapeSVG) {
            const wrapperHTML = `<div class="shape-container" contenteditable="false" style="${shapeStyle}">${shapeSVG}<div class="resize-handle"></div></div>&nbsp;`;
            insertHTMLAtCursor(wrapperHTML);
        }
    });
}

const insertLinkBtn = document.getElementById('insertLinkBtn');
if (insertLinkBtn) {
    insertLinkBtn.addEventListener('click', () => {
        const url = prompt("링크 입력!");
        if (url) {
            focusEditor();
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && !selection.isCollapsed) {
                const range = selection.getRangeAt(0);
                const link = document.createElement('a');
                link.href = url;
                link.textContent = selection.toString();
                link.target = '_blank';
                range.deleteContents();
                range.insertNode(link);
            } else {
                const linkText = prompt("링크 텍스트 입력:");
                if (linkText) {
                    const link = `<a href="${url}" target="_blank">${linkText}</a> `;
                    insertHTMLAtCursor(link);
                }
            }
        }
    });
}

const insertTableBtn = document.getElementById('insertTableBtn');
if (insertTableBtn) {
    insertTableBtn.addEventListener('click', () => {
        const rows = prompt("행 개수 입력:", "2");
        const cols = prompt("열 개수 입력:", "2");
        if (rows && cols) {
            let tableHTML = '<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;"><tbody>';
            for (let i = 0; i < parseInt(rows); i++) {
                tableHTML += '<tr>';
                for (let j = 0; j < parseInt(cols); j++) {
                    tableHTML += '<td style="padding: 8px;">&nbsp;</td>';
                }
                tableHTML += '</tr>';
            }
            tableHTML += '</tbody></table><br>';
            insertHTMLAtCursor(tableHTML);
        }
    });
}

const insertWatermarkBtn = document.getElementById('insertWatermarkBtn');
if (insertWatermarkBtn) {
    insertWatermarkBtn.addEventListener('click', () => {
        const wmText = prompt("워터마크로 사용할 텍스트를 입력하세요:", "CONFIDENTIAL");
        if (wmText) {
            const oldWm = editor.querySelector('.watermark-overlay');
            if (oldWm) oldWm.remove();

            const wmDiv = document.createElement('div');
            wmDiv.className = 'watermark-overlay';
            wmDiv.style.position = 'absolute';
            wmDiv.style.top = '50%';
            wmDiv.style.left = '50%';
            wmDiv.style.transform = 'translate(-50%, -50%) rotate(-45deg)';
            wmDiv.style.fontSize = '80px';
            wmDiv.style.color = 'rgba(0, 0, 0, 0.05)';
            wmDiv.style.pointerEvents = 'none';
            wmDiv.style.zIndex = '0';
            wmDiv.style.whiteSpace = 'nowrap';
            wmDiv.style.userSelect = 'none';
            wmDiv.textContent = wmText;

            if (window.getComputedStyle(editor).position === 'static') {
                editor.style.position = 'relative';
            }
            editor.appendChild(wmDiv);
        }
    });
}

// === 글자 스타일 T / 기울임 / 취소선 / 색상 === //
// 직접 스타일 적용 함수 (execCommand 대신 DOM 직접 조작)
function applyStyleToSelection(styleProp, styleValue) {
    // 현재 선택 영역 확인
    const selection = window.getSelection();
    let range = null;
    let selectedText = '';

    // 현재 선택 영역이 있으면 사용, 없으면 저장된 선택 영역 사용
    if (selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
        range = selection.getRangeAt(0);
        selectedText = selection.toString();
    } else if (lastSelectionRange) {
        // 저장된 선택 영역 사용
        range = lastSelectionRange.cloneRange();
        selectedText = range.toString();
    }

    // 선택 영역이 없으면 알림
    if (!range || !selectedText || !selectedText.trim()) {
        alert('스타일을 적용할 텍스트를 먼저 선택해주세요.');
        return;
    }

    // 에디터에 포커스
    editor.focus();

    // 저장된 선택 영역을 현재 선택으로 복원
    selection.removeAllRanges();
    selection.addRange(range.cloneRange());

    try {
        // execCommand 먼저 시도
        let command = '';
        if (styleProp === 'fontWeight') command = 'bold';
        else if (styleProp === 'fontStyle') command = 'italic';
        else if (styleProp === 'textDecoration') command = 'strikeThrough';
        else if (styleProp === 'color') command = 'foreColor';

        if (command) {
            const success = document.execCommand(command, false, styleValue || null);
            if (success) {
                // 선택 영역 업데이트
                saveSelection();
                editor.focus();
                return;
            }
        }
    } catch (e) {
        console.log('execCommand 실패, DOM 직접 조작으로 전환');
    }

    // execCommand 실패 시 직접 DOM 조작
    const contents = range.extractContents();
    const span = document.createElement('span');
    span.style[styleProp] = styleValue;

    // 선택된 내용을 span으로 감싸기
    if (contents.childNodes.length > 0) {
        // Fragment의 모든 노드를 span에 추가
        while (contents.firstChild) {
            span.appendChild(contents.firstChild);
        }
    } else {
        // 텍스트 노드가 없으면 선택된 텍스트로 생성
        span.textContent = selectedText;
    }

    range.insertNode(span);

    // 선택 영역을 새로 삽입한 span으로 설정
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(newRange);

    // 선택 영역 업데이트
    saveSelection();
    editor.focus();
}

// 버튼 이벤트 바인딩 (DOMContentLoaded 후 실행되도록)
let styleButtonsInitialized = false;
function initStyleButtons() {
    const homeContent = document.querySelector('.home_content');
    if (!homeContent || styleButtonsInitialized) return;

    const boldBtn = document.getElementById('boldBtn');
    const italicBtn = document.getElementById('italicBtn');
    const strikeBtn = document.getElementById('strikeBtn');
    const colorBtn = document.getElementById('colorBtn');

    if (boldBtn) {
        boldBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyStyleToSelection('fontWeight', 'bold');
        };
    }

    if (italicBtn) {
        italicBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyStyleToSelection('fontStyle', 'italic');
        };
    }

    if (strikeBtn) {
        strikeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyStyleToSelection('textDecoration', 'line-through');
        };
    }

    if (colorBtn) {
        colorBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openColorPicker();
        };
    }

    // 폰트 선택기
    const fontSelect = document.getElementById('fontSelect');
    if (fontSelect) {
        fontSelect.onchange = (e) => {
            const font = e.target.value;
            console.log('폰트 변경:', font);
            if (font === 'default') {
                applyStyleToSelection('fontFamily', ''); // 시스템 기본값으로 복원
            } else {
                applyStyleToSelection('fontFamily', font);
            }
            // 선택 후 포커스 유지
            editor.focus();
        };
    }

    // 폰트 크기 선택기
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    if (fontSizeSelect) {
        fontSizeSelect.onchange = (e) => {
            const size = e.target.value;
            console.log('폰트 크기 변경:', size);
            applyStyleToSelection('fontSize', size);
            // 선택 후 포커스 유지
            editor.focus();
        };
    }

    // 멤버 사이드바 토글
    const memberBtn = document.getElementById('memberToggleBtn');
    const closeMemberSidebarBtn = document.getElementById('closeMemberSidebarBtn');
    const memberSidebar = document.getElementById('memberSidebar');

    // 도움말 사이드바 토글
    const helpBtn = document.getElementById('btnHelpSidebar');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebar = document.getElementById('rightSidebar'); // Help sidebar

    // 정보 사이드바 토글
    const infoBtn = document.getElementById('infoToggleBtn');
    const infoCloseBtn = document.getElementById('closeInfoSidebarBtn');
    const infoSidebar = document.getElementById('infoSidebar');

    if (memberBtn && memberSidebar) {
        memberBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 다른 사이드바 닫기
            if (sidebar) sidebar.classList.remove('open');
            memberSidebar.classList.add('open');
        };
    }

    if (closeMemberSidebarBtn && memberSidebar) {
        closeMemberSidebarBtn.onclick = () => {
            memberSidebar.classList.remove('open');
        };
    }

    if (helpBtn && sidebar) {
        helpBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 다른 사이드바 닫기
            if (memberSidebar) memberSidebar.classList.remove('open');
            sidebar.classList.add('open');
        };
    }

    if (closeSidebarBtn && sidebar) {
        closeSidebarBtn.onclick = () => {
            sidebar.classList.remove('open');
        };
    }

    if (infoBtn && infoSidebar) {
        infoBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 다른 사이드바 닫기
            if (memberSidebar) memberSidebar.classList.remove('open');
            infoSidebar.classList.add('open');
        };
    }

    if (infoCloseBtn && infoSidebar) {
        infoCloseBtn.onclick = () => {
            infoSidebar.classList.remove('open');
        };
    }

    styleButtonsInitialized = true;
}


// 기본 탭 보이기
const homeItem = document.querySelector('.home_item');
if (homeItem) {
    homeItem.click();
}

// ========== 컬러 피커 ========== //
// 테마 색상 생성 (10개 기본 색상 x 6개 색조)
// Office 스타일: 각 열의 첫 번째가 가장 진한 색, 마지막이 가장 밝은 색
const themeColors = [
    ['#FFFFFF', '#F2F2F2', '#D9D9D9', '#BFBFBF', '#A6A6A6', '#808080'], // 흰색-회색 계열
    ['#000000', '#1F1F1F', '#3F3F3F', '#595959', '#737373', '#8C8C8C'], // 검은색 계열
    ['#44546A', '#5B6F8C', '#7284AE', '#8A9BD0', '#A1B2F2', '#B8C9FF'], // 진한 파란회색
    ['#4472C4', '#5B8FD8', '#72ACEC', '#8AC9FF', '#A1E6FF', '#B8FFFF'], // 파란색
    ['#ED7D31', '#F4A460', '#FBCEB1', '#FFE4E1', '#FFF8DC', '#FFFFF0'], // 주황색 계열
    ['#E7E6E6', '#D0CECE', '#B9B6B6', '#A29E9E', '#8B8686', '#746E6E'], // 회색
    ['#FFC000', '#FFD24D', '#FFE499', '#FFF6E6', '#FFFFCC', '#FFFFE6'], // 노란색
    ['#5B9BD5', '#7AB3E0', '#99CBEB', '#B8E3F6', '#D7FBFF', '#F6FFFF'], // 하늘색
    ['#70AD47', '#8BC269', '#A6D78B', '#C1ECAD', '#DCFFCF', '#F7FFF1'], // 연두색
    ['#C55A11', '#D77A3A', '#E99A63', '#F5BA8C', '#FFDAB5', '#FFFADE'], // 갈색 계열
];

// 표준 색상
const standardColors = [
    '#FF0000', // 빨강
    '#FF7F00', // 주황
    '#FFFF00', // 노랑
    '#7FFF00', // 연두
    '#00FF00', // 초록
    '#00FFFF', // 청록
    '#007FFF', // 하늘색
    '#0000FF', // 파랑
    '#7F00FF', // 보라
    '#FF00FF', // 자홍
];

// 컬러 피커 초기화
function initColorPicker() {
    const themeGrid = document.getElementById('themeColorsGrid');
    const standardGrid = document.getElementById('standardColorsGrid');

    if (!themeGrid || !standardGrid) return;

    // 테마 색상 그리드 생성 (10개 열 x 6개 행)
    // 먼저 기본 색상 행 추가
    themeColors.forEach((colorColumn) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = colorColumn[0]; // 첫 번째 색상이 기본 색상
        swatch.setAttribute('data-color', colorColumn[0]);
        swatch.onclick = () => selectColor(colorColumn[0]);
        themeGrid.appendChild(swatch);
    });

    // 나머지 색조 행 추가 (5개 행)
    for (let row = 1; row < 6; row++) {
        themeColors.forEach((colorColumn) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = colorColumn[row];
            swatch.setAttribute('data-color', colorColumn[row]);
            swatch.onclick = () => selectColor(colorColumn[row]);
            themeGrid.appendChild(swatch);
        });
    }

    // 표준 색상 그리드 생성
    standardColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.setAttribute('data-color', color);
        swatch.onclick = () => selectColor(color);
        standardGrid.appendChild(swatch);
    });

    // 자동 색상 클릭 이벤트
    const automaticRow = document.querySelector('.automatic-row');
    if (automaticRow) {
        automaticRow.onclick = () => {
            // 자동 색상은 기본 색상(검은색)으로 설정
            selectColor('#000000');
        };
    }

    // 다른 색 버튼
    const moreColorsBtn = document.getElementById('moreColorsBtn');
    if (moreColorsBtn) {
        moreColorsBtn.onclick = () => {
            const color = prompt('색상 코드를 입력하세요 (예: #FF0000 또는 rgb(255,0,0)):');
            if (color) {
                selectColor(color);
            }
        };
    }

    // 모달 외부 클릭 시 닫기
    const modal = document.getElementById('colorPickerModal');
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeColorPicker();
            }
        };
    }
}

// 컬러 피커 열기
function openColorPicker() {
    const modal = document.getElementById('colorPickerModal');
    if (modal) {
        modal.style.display = 'flex';
        // 컬러 피커가 아직 초기화되지 않았다면 초기화
        if (document.querySelectorAll('#themeColorsGrid .color-swatch').length === 0) {
            initColorPicker();
        }
    }
}

// 컬러 피커 닫기
function closeColorPicker() {
    const modal = document.getElementById('colorPickerModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 색상 선택
function selectColor(color) {
    // 도형이 선택되어 있다면 도형 색상 변경
    if (selectedShapeContainer) {
        const svgPath = selectedShapeContainer.querySelector('rect, circle, polygon, path, ellipse');
        if (svgPath) {
            svgPath.style.fill = color;
        }
        closeColorPicker();
        return;
    }

    applyStyleToSelection('color', color);
    closeColorPicker();
}

// 페이지 로드 후 초기화 (탭이 보인 후에 버튼 초기화)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initStyleButtons, 100);
        initColorPicker();
    });
} else {
    setTimeout(initStyleButtons, 100);
    initColorPicker();
}

// === 도형 인터랙션 (선택 및 리사이즈) === //
let selectedShapeContainer = null;
let isResizing = false;
let startX, startY, startWidth, startHeight;

// 에디터 내 클릭 이벤트 위임
if (editor) {
    editor.addEventListener('mousedown', (e) => {
        // 이미 리사이징 중이면 무시
        if (isResizing) return;

        // 도형 컨테이너 클릭 
        const container = e.target.closest('.shape-container');
        if (container) {
            // 다른 곳 클릭 시 선택 해제는 blur나 다른 로직이 처리하지만,
            // 여기서 명시적으로 선택 설정
            if (selectedShapeContainer && selectedShapeContainer !== container) {
                selectedShapeContainer.classList.remove('selected');
            }
            selectedShapeContainer = container;
            selectedShapeContainer.classList.add('selected');

            // 리사이즈 핸들 클릭 확인
            if (e.target.classList.contains('resize-handle')) {
                e.preventDefault(); // 텍스트 선택 방지
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseInt(getComputedStyle(container).width, 10);
                startHeight = parseInt(getComputedStyle(container).height, 10);

                // 리사이즈 중 마우스 이동/업 이벤트는 document에 걸어야 함 (빠르게 움직일 때 벗어남 방지)
                document.addEventListener('mousemove', onResizeMove);
                document.addEventListener('mouseup', onResizeUp);
            }
        } else {
            // 빈 곳 클릭 시 선택 해제
            if (selectedShapeContainer) {
                selectedShapeContainer.classList.remove('selected');
                selectedShapeContainer = null;
            }
        }
    });
}

function onResizeMove(e) {
    if (!isResizing || !selectedShapeContainer) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Shift 키 누르면 비율 유지 (선택 사항)

    selectedShapeContainer.style.width = (startWidth + dx) + 'px';
    selectedShapeContainer.style.height = (startHeight + dy) + 'px';
}

function onResizeUp(e) {
    isResizing = false;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeUp);
}

// === 노트 생성 및 로드 기능 === //

// (Legacy note creation logic removed)



// 사용자의 노트 목록 로드
async function loadUserNotes() {
    const userId = loggedInUserId;
    if (!userId) return;

    try {
        const response = await fetch('/get_notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });

        const data = await response.json();

        if (data.message === "2") {
            currentNotes = data.notes;
            displayNotes(data.notes);
        } else {
            console.error("노트 로드 실패:", data.error);
        }
    } catch (error) {
        console.error("Get Notes Error:", error);
    }
}

// 노트 목록 UI에 표시
function displayNotes(notes) {
    const noteContainer = document.querySelector('.note');
    if (!noteContainer) return;

    // 기존 노트 아이템 제거 (add_new_note 버튼과 title은 유지)
    const existingNotes = noteContainer.querySelectorAll('.note_item');
    existingNotes.forEach(item => item.remove());

    // 노트가 없으면 메시지 표시
    if (!notes || notes.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'empty_message';
        emptyMessage.textContent = '아직 생성된 노트가 없습니다. 새 노트를 만들어보세요!';
        emptyMessage.style.cssText = 'color: #888; margin: 20px; text-align: center;';
        noteContainer.appendChild(emptyMessage);
        return;
    }

    // 각 노트를 UI에 추가
    notes.forEach(note => {
        const noteItem = document.createElement('div');
        noteItem.className = 'note_item';

        // 텍스트 요약 생성 (HTML 태그 제거)
        const plainText = (note.contents || '').replace(/<[^>]*>/g, '');
        const summary = plainText.substring(0, 100) + (plainText.length > 100 ? '...' : '');

        noteItem.innerHTML = `
            <div class="note_title">${note.title}</div>
            <div class="note_summary">${summary || '내용 없음'}</div>
            <div class="note_footer">
                <div class="note_date" style="font-size: 11px; color: #999;">
                    ${new Date(note.createdAt || Date.now()).toLocaleDateString()}
                </div>
                <div class="note_editors">
                    ${(note.editors || []).map(editor => `
                        <div class="editor_badge" title="${editor}">
                            ${editor.charAt(0).toUpperCase()}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // 노트 클릭 시 에디터 열기
        noteItem.addEventListener('click', () => {
            openNoteInEditor(note);
        });

        noteContainer.appendChild(noteItem);
    });
}

// 노트를 에디터에서 열기
function openNoteInEditor(note) {
    // 메인 메뉴 숨기고 에디터 표시
    const mainMenu = document.querySelector('.main_menu');
    const editorMain = document.querySelector('.editor_main');

    if (mainMenu) mainMenu.style.display = 'none';
    if (editorMain) editorMain.style.display = 'block';

    // 에디터에 노트 내용 로드
    const editor = document.querySelector('.content');
    if (editor) {
        editor.innerHTML = note.contents || '';
        // 현재 노트 ID 저장 (나중에 저장 기능 구현 시 사용)
        editor.dataset.noteId = note._id;
        editor.dataset.noteTitle = note.title;
    }

    // 에디터 제목 표시 (선택사항 - UI에 제목 표시 영역이 있다면)
    console.log(`노트 열림: ${note.title} (ID: ${note._id})`);

    // 이벤트 리스너 재설정을 위해 플래그 리셋
    editorListenersAttached = false;

    // 자동 저장 타이머 시작
    startAutoSave();
}

// === 노트 저장 기능 === //

let autoSaveInterval = null;
let lastSavedContent = '';

// 노트 저장 함수
async function saveNote(showAlert = false) {
    const editor = document.querySelector('.content');
    const autoSaveStatus = document.getElementById('autoSaveStatus');

    if (!editor || !editor.dataset.noteId) {
        if (showAlert) alert("저장할 노트가 없습니다.");
        return;
    }

    const noteId = editor.dataset.noteId;
    const contents = editor.innerHTML;

    // 내용이 변경되지 않았으면 저장하지 않음
    if (contents === lastSavedContent && !showAlert) {
        if (autoSaveStatus) {
            autoSaveStatus.textContent = '변경사항 없음';
            autoSaveStatus.style.color = '#999';
        }
        return;
    }

    try {
        if (autoSaveStatus) {
            autoSaveStatus.textContent = '저장 중...';
            autoSaveStatus.style.color = '#2487ac';
        }

        const response = await fetch('/save_note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteId, contents }),
        });

        const data = await response.json();

        if (data.message === "1") {
            lastSavedContent = contents;
            const now = new Date();
            const timeString = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

            if (autoSaveStatus) {
                autoSaveStatus.textContent = `✓ 저장됨 (${timeString})`;
                autoSaveStatus.style.color = '#4CAF50';
            }

            if (showAlert) {
                alert("노트가 저장되었습니다!");
            }

            console.log(`노트 저장 완료: ${timeString}`);
        } else {
            throw new Error(data.error || "저장 실패");
        }
    } catch (error) {
        console.error("Save Note Error:", error);

        if (autoSaveStatus) {
            autoSaveStatus.textContent = '❌ 저장 실패';
            autoSaveStatus.style.color = '#f44336';
        }

        if (showAlert) {
            alert("노트 저장 중 오류가 발생했습니다.");
        }
    }
}

// 자동 저장 시작 (30초 간격)
function startAutoSave() {
    // 기존 타이머가 있으면 제거
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
    }

    const autoSaveStatus = document.getElementById('autoSaveStatus');
    if (autoSaveStatus) {
        autoSaveStatus.textContent = '자동 저장 활성화 (30초 간격)';
        autoSaveStatus.style.color = '#666';
    }

    // 30초마다 자동 저장 (30000ms = 30초)
    autoSaveInterval = setInterval(() => {
        saveNote(false); // 자동 저장은 알림 표시 안 함
    }, 30000);

    // 에디터 내용 초기화
    const editor = document.querySelector('.content');
    if (editor) {
        lastSavedContent = editor.innerHTML;
    }
}

// 자동 저장 중지
function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }

    const autoSaveStatus = document.getElementById('autoSaveStatus');
    if (autoSaveStatus) {
        autoSaveStatus.textContent = '자동 저장 중지됨';
        autoSaveStatus.style.color = '#999';
    }
}

// 메인 메뉴로 돌아가기 (저장 포함)
async function backToMainMenu() {
    // 1. 저장 수행
    await saveNote(false);

    // 2. 자동 저장 중지
    stopAutoSave();

    // 3. 소켓 방 퇴장 (필요시)
    // socket.emit('leave-note', { noteId: currentNoteId, userId: loggedInUserId });

    // 4. 화면 전환
    const mainMenu = document.querySelector('.main_menu');
    const editorMain = document.querySelector('.editor_main');

    if (editorMain) editorMain.style.display = 'none';
    if (mainMenu) {
        mainMenu.style.display = 'block';
        // 노트 목록 갱신
        loadUserNotes();
    }
}

// 수동 저장 버튼 이벤트 및 뒤로 가기 버튼 이벤트
//기존 saveNoteBtn 리스너 제거 (중복 방지)
// 기존 saveNoteBtn 대신 새로운 버튼들 연결
const onlineSaveBtn = document.getElementById('onlineSaveBtn');
const ntSaveBtn = document.getElementById('ntSaveBtn');
const pdfSaveBtn = document.getElementById('pdfSaveBtn');
const wordSaveBtn = document.getElementById('wordSaveBtn');

if (onlineSaveBtn) onlineSaveBtn.onclick = (e) => { e.stopPropagation(); saveNote(true); };
if (ntSaveBtn) ntSaveBtn.onclick = (e) => { e.stopPropagation(); exportNt(); };
if (pdfSaveBtn) pdfSaveBtn.onclick = (e) => { e.stopPropagation(); exportPdf(); };
if (wordSaveBtn) wordSaveBtn.onclick = (e) => { e.stopPropagation(); exportDocx(); };

document.getElementById('onlineLoadBtn').onclick = () => openOnlineLoadModal();
document.getElementById('localLoadBtn').onclick = () => document.getElementById('localFileInput').click();

// 사이드바 토글 버튼들
document.getElementById('memberToggleBtn').onclick = () => {
    document.getElementById('memberSidebar').classList.add('open');
};
document.getElementById('helpToggleBtn').onclick = () => {
    document.getElementById('rightSidebar').classList.add('open');
};
document.getElementById('infoToggleBtn').onclick = () => {
    document.getElementById('infoSidebar').classList.add('open');
};

// 사이드바 닫기 버튼들
document.getElementById('closeMemberSidebarBtn').onclick = () => {
    document.getElementById('memberSidebar').classList.remove('open');
};
document.getElementById('closeSidebarBtn').onclick = () => {
    document.getElementById('rightSidebar').classList.remove('open');
};
document.getElementById('closeInfoSidebarBtn').onclick = () => {
    document.getElementById('infoSidebar').classList.remove('open');
};

const backToHomeBtn = document.getElementById('backToHomeBtn');
if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', () => {
        backToMainMenu();
    });
}

// === 파일 내보내기 기능 ===
function downloadFile(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
}

function exportNt() {
    const editor = document.querySelector('.content');
    const title = editor.dataset.noteTitle || 'note';
    downloadFile(editor.innerHTML, `${title}.nt`, 'text/html');
}

function exportDocx() {
    const editor = document.querySelector('.content');
    const title = editor.dataset.noteTitle || 'note';

    // HTML을 Word가 인식하는 형식으로 감싸기
    const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML to Word Document with JavaScript</title><style>body{font-family:'Noto Sans KR', sans-serif;} p{margin-bottom:10px;}</style></head><body>";
    const postHtml = "</body></html>";

    // 내용 결합
    const html = preHtml + editor.innerHTML + postHtml;

    // Blob 생성 (MS Word MIME type)
    const blob = new Blob(['\ufeff', html], {
        type: 'application/msword'
    });

    // 다운로드 링크 생성
    const url = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(html);

    // navigator.msSaveOrOpenBlob IE support, else downloadFile logic
    const downloadLink = document.createElement("a");
    document.body.appendChild(downloadLink);

    if (navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, `${title}.doc`);
    } else {
        downloadLink.href = url;
        downloadLink.download = `${title}.doc`;
        downloadLink.click();
    }

    document.body.removeChild(downloadLink);
}

async function exportPdf() {
    const editor = document.querySelector('.content');
    const title = editor.dataset.noteTitle || 'note';

    const tempWrapper = document.createElement('div');
    tempWrapper.id = 'pdf-temp-wrapper';
    tempWrapper.style.padding = '40px';
    tempWrapper.style.background = '#fff';
    tempWrapper.style.width = '750px';

    // 🔥 핵심
    tempWrapper.style.position = 'absolute';
    tempWrapper.style.top = '0';
    tempWrapper.style.left = '0';
    tempWrapper.style.zIndex = '-1';   // 화면 뒤로만 보냄
    tempWrapper.style.color = '#000';
    tempWrapper.style.fontFamily = '"Noto Sans KR", Arial, sans-serif';

    tempWrapper.innerHTML = editor.innerHTML;
    document.body.appendChild(tempWrapper);

    // ✅ 이미지 로딩 대기 (안 기다리면 빈 캔버스 나올 때 있음)
    const imgs = [...tempWrapper.querySelectorAll('img')];
    await Promise.all(imgs.map(img => new Promise(res => {
        if (img.complete) return res();
        img.onload = () => res();
        img.onerror = () => res();
    })));

    // ✅ 이미지가 있는 경우 scale을 낮추는 게 안정적임
    // (이미지가 없으면 scale 2도 괜찮음)
    const hasImage = imgs.length > 0;
    const scaleValue = hasImage ? 1 : 2;

    const opt = {
        margin: [15, 15, 15, 15],
        filename: `${title}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
            scale: scaleValue,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,

            onclone: (clonedDoc) => {
                const w = clonedDoc.querySelector('#pdf-temp-wrapper');
                if (!w) return;

                // ❌ transform / opacity / visibility 만지지 마
                w.style.position = 'relative';
                w.style.background = '#fff';
                w.style.color = '#000';

                // 이미지 안정화
                w.querySelectorAll('img').forEach(img => {
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    img.style.display = 'block';
                });
            }

        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    };

    try {
        showNotification("PDF 저장 중...");
        await html2pdf().set(opt).from(tempWrapper).save();
        showNotification("PDF 저장이 완료되었습니다.");
    } catch (err) {
        console.error("PDF Export Error:", err);
        alert("PDF 생성 중 오류가 발생했습니다.");
    } finally {
        tempWrapper.remove();
    }
}



// === 불러오기 기능 ===
async function openOnlineLoadModal() {
    // 리스트를 띄우기 전 최신 노트 목록을 다시 로드
    await loadUserNotes();

    const modal = document.getElementById('onlineLoadModal');
    const listContainer = document.getElementById('onlineLoadList');
    listContainer.innerHTML = '';

    modal.style.display = 'flex';

    // 현재 편집 중인 노트 제외하고 목록 표시
    const currentNoteId = document.querySelector('.content').dataset.noteId;
    const otherNotes = currentNotes.filter(n => n._id !== currentNoteId);

    if (otherNotes.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">불러올 다른 문서가 없습니다.</p>';
        return;
    }

    otherNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'load-note-item';
        item.innerHTML = `
            <div class="note-name">${note.title}</div>
            <div class="note-meta">${new Date(note.createdAt || Date.now()).toLocaleDateString()}</div>
        `;
        item.onclick = () => {
            if (confirm(`'${note.title}' 내용을 가져오시겠습니까? 현재 내용은 덮어씌워집니다.`)) {
                const editor = document.querySelector('.content');
                editor.innerHTML = note.contents || '';
                modal.style.display = 'none';
                showNotification("문서를 불러왔습니다.");
            }
        };
        listContainer.appendChild(item);
    });
}

document.getElementById('cancelOnlineLoadBtn').onclick = () => {
    document.getElementById('onlineLoadModal').style.display = 'none';
};

// 로컬 파일 처리
document.getElementById('localFileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target.result;
        if (confirm("로컬 파일을 불러오시겠습니까? 현재 내용은 덮어씌워집니다.")) {
            const editor = document.querySelector('.content');
            editor.innerHTML = content;
            showNotification("로컬 문서를 불러왔습니다.");
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // 초기화
};


// 페이지 떠나기 전 저장 (선택사항)
window.addEventListener('beforeunload', (e) => {
    const editor = document.querySelector('.content');
    if (editor && editor.dataset.noteId && editor.innerHTML !== lastSavedContent) {
        // 변경사항이 있으면 경고
        e.preventDefault();
        e.returnValue = '저장하지 않은 변경사항이 있습니다.';
    }
});


// Note: Login logic is now handled by performLogin function at the top.
// Duplicate event listener on line 1361-1408 removed.

// === 실시간 협업 기능 (Socket.io) === //

// Socket.io 연결
function initializeSocket() {
    if (socket) return;

    socket = io();

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        if (loggedInUserId) {
            socket.emit('register-user', loggedInUserId);
        }
    });

    // 워크스페이스 초대 실시간 알림
    socket.on('workspace-invite', ({ workspaceId, name }) => {
        showNotification(`'${name}' 워크스페이스에 초대되었습니다!`);
        loadInvitations(); // 초대 목록 갱신
    });

    // 새 사용자 참여
    socket.on('user-joined', ({ userId, color, users }) => {
        console.log(`User joined: ${userId} with color ${color}`);
        updateMembersList(users);

        if (userId !== currentUserId) {
            showNotification(`${userId}님이 참여했습니다.`);
        }
    });

    // 사용자 퇴장
    socket.on('user-left', ({ userId, users }) => {
        console.log(`User left: ${userId}`);
        updateMembersList(users);
        removeRemoteCursor(userId);
        showNotification(`${userId}님이 나갔습니다.`);
    });

    // 커서 업데이트
    socket.on('cursor-update', ({ userId, position, color }) => {
        updateRemoteCursor(userId, position, color);
    });

    // 선택 영역 업데이트
    socket.on('selection-update', ({ userId, range, color }) => {
        updateRemoteSelection(userId, range, color);
    });

    // 내용 업데이트
    socket.on('content-update', ({ userId, content }) => {
        if (userId !== currentUserId) {
            console.log('Receiving content from:', userId);
            console.log('Content HTML:', content.substring(0, 200)); // 처음 200자만 로그

            isUpdatingFromRemote = true;
            const editor = document.querySelector('.content');
            if (editor) {
                // 현재 커서 위치(오프셋) 저장
                const offset = getCursorOffset(editor);

                // HTML 그대로 설정 (서식 포함)
                editor.innerHTML = content;

                // 커서 위치 복원
                setCursorOffset(editor, offset);
            }
            isUpdatingFromRemote = false;
        }
    });

    // 영역 잠금 알림 (AI 교정 중)
    socket.on('region-locked', ({ userId, range }) => {
        console.log(`Region locked by ${userId}`);
        showLockOverlay(userId, range);
    });

    // 영역 잠금 해제 알림
    socket.on('region-unlocked', ({ userId }) => {
        console.log(`Region unlocked by ${userId}`);
        hideLockOverlay(userId);
    });
}

// 노트 방 참여
function joinNoteRoom(noteId, userId) {
    currentNoteId = noteId;
    currentUserId = userId;

    if (!socket) {
        initializeSocket();
    }

    socket.emit('join-note', { noteId, userId });

    // 에디터 이벤트 리스너 추가 (중복 방지)
    const editor = document.querySelector('.content');
    if (editor && !editorListenersAttached) {
        editorListenersAttached = true;

        // 내용 변경 감지
        const handleInput = () => {
            if (isUpdatingFromRemote) return;

            clearTimeout(contentChangeTimeout);
            contentChangeTimeout = setTimeout(() => {
                if (socket && currentNoteId && currentUserId) {
                    const htmlContent = editor.innerHTML;
                    console.log('Sending content change:', currentUserId);
                    console.log('Sending HTML:', htmlContent.substring(0, 200)); // 처음 200자만 로그
                    socket.emit('content-change', {
                        noteId: currentNoteId,
                        userId: currentUserId,
                        content: htmlContent
                    });
                }
            }, 100); // 100ms로 감소 (더 빠른 동기화)
        };

        editor.addEventListener('input', handleInput);

        // 커서 이동 감지
        const handleCursorMove = () => {
            clearTimeout(cursorMoveTimeout);
            cursorMoveTimeout = setTimeout(sendCursorPosition, 50); // 50ms로 감소 (더 빠른 커서 추적)
        };

        editor.addEventListener('click', sendCursorPosition);

        // 선택 영역 변경 감지
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                lastSelectedRange = selection.getRangeAt(0).cloneRange();
            }
            sendSelection();
        };

        editor.addEventListener('mouseup', handleSelectionChange);
        editor.addEventListener('keyup', (e) => {
            handleCursorMove();
            handleSelectionChange();
        });

        console.log('Editor event listeners attached');
    }
}

// 커서 위치 전송
function sendCursorPosition() {
    if (!socket || !currentNoteId || isUpdatingFromRemote) return;

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // 에디터 본문(.content) 기준으로 위치 계산하여 전송 (정확도 향상)
        const editor = document.querySelector('.content');
        const editorRect = editor ? editor.getBoundingClientRect() : { left: 0, top: 0 };

        socket.emit('cursor-move', {
            noteId: currentNoteId,
            userId: currentUserId,
            vertex: true, // 보정용 플래그
            position: {
                x: rect.left - editorRect.left,
                y: rect.top - editorRect.top
            },
            color: myColor
        });
    }
}

// 선택 영역 전송
function sendSelection() {
    if (!socket || !currentNoteId || isUpdatingFromRemote) return;

    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // 에디터 본문(.content) 기준으로 위치 계산
        const editor = document.querySelector('.content');
        const editorRect = editor ? editor.getBoundingClientRect() : { left: 0, top: 0 };

        socket.emit('selection-change', {
            noteId: currentNoteId,
            userId: currentUserId,
            range: {
                x: rect.left - editorRect.left,
                y: rect.top - editorRect.top,
                width: rect.width,
                height: rect.height
            },
            color: myColor
        });
    }
}

// 원격 커서 업데이트
function updateRemoteCursor(userId, position, color) {
    let cursor = remoteCursors.get(userId);

    if (!cursor) {
        cursor = document.createElement('div');
        cursor.className = 'remote-cursor';
        cursor.style.cssText = `
            position: absolute;
            width: 2px;
            height: 20px;
            background: ${color};
            pointer-events: none;
            z-index: 9999;
            transition: all 0.1s ease;
        `;

        const label = document.createElement('div');
        label.textContent = userId;
        label.style.cssText = `
            position: absolute;
            top: -20px;
            left: 0;
            background: ${color};
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            white-space: nowrap;
        `;
        cursor.appendChild(label);

        // 에디터 본문(.content)에 추가하여 종이 위치와 동기화
        const editor = document.querySelector('.content');
        if (editor) {
            editor.appendChild(cursor);
        } else {
            document.body.appendChild(cursor);
        }
        remoteCursors.set(userId, cursor);
    }

    cursor.style.left = position.x + 'px';
    cursor.style.top = position.y + 'px';
}

// 원격 선택 영역 업데이트
function updateRemoteSelection(userId, range, color) {
    // 기존 선택 영역 제거
    const existingSelection = document.querySelector(`.remote-selection-${userId.replace(/[^a-zA-Z0-9]/g, '_')}`);
    if (existingSelection) {
        existingSelection.remove();
    }

    // 새 선택 영역 생성
    const selection = document.createElement('div');
    selection.className = `remote-selection remote-selection-${userId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    selection.style.cssText = `
        position: absolute;
        left: ${range.x}px;
        top: ${range.y}px;
        width: ${range.width}px;
        height: ${range.height}px;
        background: ${color};
        opacity: 0.3;
        pointer-events: none;
        z-index: 9998;
    `;

    // 에디터 본문(.content)에 추가
    const editor = document.querySelector('.content');
    if (editor) {
        editor.appendChild(selection);
    } else {
        document.body.appendChild(selection);
    }

    // 3초 후 자동 제거
    setTimeout(() => {
        selection.remove();
    }, 3000);
}

// 원격 커서 제거
function removeRemoteCursor(userId) {
    const cursor = remoteCursors.get(userId);
    if (cursor) {
        cursor.remove();
        remoteCursors.delete(userId);
    }

    const selection = document.querySelector(`.remote-selection-${userId.replace(/[^a-zA-Z0-9]/g, '_')}`);
    if (selection) {
        selection.remove();
    }
}

// 멤버 목록 업데이트
function updateMembersList(users) {
    const activeMembersList = document.getElementById('activeMembersList');
    if (!activeMembersList) return;

    activeMembersList.innerHTML = '';

    users.forEach(user => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-list-item';
        memberItem.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 15px;';

        const avatar = document.createElement('div');
        avatar.style.cssText = `
            width: 36px;
            height: 36px;
            background: ${user.color};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
        `;
        avatar.textContent = user.userId.substring(0, 2).toUpperCase();

        const info = document.createElement('div');
        const name = document.createElement('div');
        name.style.cssText = 'font-weight: 600; font-size: 14px;';
        name.textContent = user.userId;

        const status = document.createElement('div');
        status.style.cssText = `font-size: 12px; color: ${user.color};`;
        status.textContent = user.userId === currentUserId ? '나' : '편집 중';

        info.appendChild(name);
        info.appendChild(status);
        memberItem.appendChild(avatar);
        memberItem.appendChild(info);
        activeMembersList.appendChild(memberItem);

        // 내 색상 저장
        if (user.userId === currentUserId) {
            myColor = user.color;
        }
    });
}

// 모든 편집자 목록 업데이트
function updateAllEditorsList(editors) {
    const allEditorsList = document.getElementById('allEditorsList');
    if (!allEditorsList) return;

    allEditorsList.innerHTML = '';

    editors.forEach(editorId => {
        const editorItem = document.createElement('div');
        editorItem.style.cssText = 'padding: 8px; background: #f5f5f5; border-radius: 4px; margin-bottom: 8px; font-size: 14px;';
        editorItem.textContent = editorId;
        allEditorsList.appendChild(editorItem);
    });
}

// 알림 표시
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2487ac;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 멤버 추가 버튼
const addMemberBtn = document.getElementById('addMemberBtn');
if (addMemberBtn) {
    addMemberBtn.addEventListener('click', async () => {
        const addMemberInput = document.getElementById('addMemberInput');
        const userId = addMemberInput.value.trim();

        if (!userId) {
            alert('사용자 ID를 입력해주세요.');
            return;
        }

        const editor = document.querySelector('.content');
        if (!editor || !editor.dataset.noteId) {
            alert('노트를 먼저 열어주세요.');
            return;
        }

        const noteId = editor.dataset.noteId;

        try {
            const response = await fetch('/add_member', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ noteId, userId }),
            });

            const data = await response.json();

            if (data.message === "1") {
                alert(`${userId}님을 멤버로 추가했습니다!`);
                addMemberInput.value = '';
                updateAllEditorsList(data.editors);
            } else {
                alert('멤버 추가 실패: ' + (data.error || '알 수 없는 오류'));
            }
        } catch (error) {
            console.error('Add Member Error:', error);
            alert('서버와 통신 중 오류가 발생했습니다.');
        }
    });
}

// openNoteInEditor 함수 수정 - Socket 연결 추가
const originalOpenNoteInEditor = openNoteInEditor;
openNoteInEditor = function (note) {
    originalOpenNoteInEditor(note);

    // Socket 방 참여 (전역 변수 사용)
    if (loggedInUserId) {
        console.log('Joining note room:', note._id, 'as user:', loggedInUserId);
        joinNoteRoom(note._id, loggedInUserId);
        updateAllEditorsList(note.editors);
    }
};

// === AI 교정 기능 상세 구현 === //

let isAiProofreading = false;
let lastSelectedRange = null; // 마지막 선택 영역 저장
const remoteLocks = new Map(); // userId -> mask element

// AI 교정 버튼 클릭
const aiProofreadBtn = document.getElementById('aiProofreadBtn');
if (aiProofreadBtn) {
    aiProofreadBtn.addEventListener('click', async () => {
        if (isAiProofreading) return;

        // 선택 영역 확인 (없으면 마지막 저장된 영역 사용)
        const selection = window.getSelection();
        let range = (selection && selection.rangeCount > 0 && !selection.isCollapsed)
            ? selection.getRangeAt(0)
            : lastSelectedRange;

        if (!range) {
            alert('교정할 텍스트를 먼저 선택해주세요.');
            return;
        }

        const instructionInput = document.getElementById('aiInstructionInput');
        const instruction = instructionInput.value.trim() || "문법 및 문맥 교정";
        const selectedText = range.toString();
        const rect = range.getBoundingClientRect();

        // 에디터 컨테이너 기준으로 위치 계산
        const editorContainer = document.querySelector('.editor_main');
        const containerRect = editorContainer.getBoundingClientRect();
        const relativeRange = {
            x: rect.left - containerRect.left + editorContainer.scrollLeft,
            y: rect.top - containerRect.top + editorContainer.scrollTop,
            width: rect.width,
            height: rect.height
        };

        try {
            isAiProofreading = true;
            aiProofreadBtn.textContent = '교정 중...';
            aiProofreadBtn.style.opacity = '0.7';

            // 서버에 영역 잠금 알림
            socket.emit('lock-region', {
                noteId: currentNoteId,
                userId: currentUserId,
                range: relativeRange
            });

            // 내 화면에도 잠금 표시 (로딩용)
            showLockOverlay('나', relativeRange, true);

            // AI 교정 요청
            const response = await fetch('/ai-proofread', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: selectedText,
                    instruction: instruction,
                    userId: currentUserId,
                    noteId: currentNoteId
                })
            });

            const data = await response.json();

            if (data.message === "1") {
                // 텍스트 교체
                const newText = data.proofreadText;
                range.deleteContents();
                range.insertNode(document.createTextNode(newText));

                // 변경사항 동기화
                const editor = document.querySelector('.content');
                socket.emit('content-change', {
                    noteId: currentNoteId,
                    userId: currentUserId,
                    content: editor.innerHTML
                });
            } else {
                alert('AI 교정 중 오류가 발생했습니다: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('AI Proofread Error:', error);
            alert('서버와 통신 중 오류가 발생했습니다.');
        } finally {
            isAiProofreading = false;
            aiProofreadBtn.textContent = '교정';
            aiProofreadBtn.style.opacity = '1';

            // 서버에 잠금 해제 알림
            socket.emit('unlock-region', {
                noteId: currentNoteId,
                userId: currentUserId
            });

            // 내 화면 잠금 해제
            hideLockOverlay('나');
        }
    });
}

// 잠금 오버레이 표시
function showLockOverlay(userId, range, isLocal = false) {
    // 기존 오버레이가 있으면 제거
    hideLockOverlay(userId);

    const overlay = document.createElement('div');
    overlay.className = `lock-overlay lock-overlay-${userId.replace(/[^a-zA-Z0-9]/g, '_')}`;

    overlay.style.cssText = `
        position: absolute;
        left: ${range.x}px;
        top: ${range.y}px;
        width: ${range.width}px;
        height: ${range.height}px;
        background: ${isLocal ? 'rgba(36, 135, 172, 0.2)' : 'rgba(255, 107, 107, 0.2)'};
        border: 1px dashed ${isLocal ? '#2487ac' : '#FF6B6B'};
        pointer-events: auto;
        z-index: 10001;
        cursor: not-allowed;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    if (!isLocal) {
        overlay.title = "이 부분은 AI가 교정중입니다.";
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showNotification(`${userId}님이 이 부분을 AI로 교정하고 있습니다. 잠시만 기다려주세요.`);
        });
    } else {
        overlay.innerHTML = '<span style="color: #2487ac; font-size: 10px; font-weight: bold; background: white; padding: 2px 4px; border-radius: 3px;">AI 교정 중...</span>';
    }

    const editorContainer = document.querySelector('.editor_main');
    if (editorContainer) {
        editorContainer.appendChild(overlay);
        remoteLocks.set(userId, overlay);
    }
}

// 잠금 오버레이 제거
function hideLockOverlay(userId) {
    const overlay = remoteLocks.get(userId);
    if (overlay) {
        overlay.remove();
        remoteLocks.delete(userId);
    }

    // 클래스명으로도 찾아 제거 (안전장치)
    const overlayByClass = document.querySelector(`.lock-overlay-${userId.replace(/[^a-zA-Z0-9]/g, '_')}`);
    if (overlayByClass) overlayByClass.remove();
}

// 에디터 클릭 시 잠금 확인 (추가 방어막)
const editorContainerForLock = document.querySelector('.content');
if (editorContainerForLock) {
    editorContainerForLock.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (target.closest('.lock-overlay')) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

// CSS 애니메이션 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    .lock-overlay {
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 0.8; }
        100% { opacity: 0.6; }
    }
`;
document.head.appendChild(style);

// === 워크스페이스 기능 상세 구현 === //

// 워크스페이스 목록 로드
async function loadWorkspaces() {
    if (!loggedInUserId) return;
    try {
        const response = await fetch('/get_workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: loggedInUserId })
        });
        const data = await response.json();
        if (data.message === "1") {
            currentWorkspaces = data.workspaces;
            renderWorkspaces();
            updateWorkspaceSelect();
        }
    } catch (error) {
        console.error("Load Workspaces Error:", error);
    }
}

// 초대 목록 로드
async function loadInvitations() {
    if (!loggedInUserId) return;
    try {
        const response = await fetch('/get_workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: loggedInUserId })
        });
        const data = await response.json();
        if (data.message === "1") {
            currentInvitations = data.workspaces.filter(ws =>
                ws.members.some(m => m.userId === loggedInUserId && m.status === 'pending')
            );
            renderInvitations();
        }
    } catch (error) {
        console.error("Load Invitations Error:", error);
    }
}

// 워크스페이스 목록 렌더링
function renderWorkspaces() {
    const listContainer = document.getElementById('myWorkspaceList');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const acceptedWorkspaces = currentWorkspaces.filter(ws =>
        ws.members.some(m => m.userId === loggedInUserId && m.status === 'accepted')
    );

    if (acceptedWorkspaces.length === 0) {
        listContainer.innerHTML = '<p style="color: #999; font-size: 13px;">참여 중인 워크스페이스가 없습니다.</p>';
        return;
    }

    acceptedWorkspaces.forEach(ws => {
        const memberCount = ws.members ? ws.members.length : 0;
        listContainer.insertAdjacentHTML('beforeend', `
            <div class="workspace-item" onclick="openWorkspaceDetail('${ws._id}')" style="cursor: pointer;">
                <div class="workspace-info">
                    <span class="workspace-name">${ws.name}</span>
                    <span class="workspace-meta">멤버 ${memberCount}명</span>
                </div>
            </div>
        `);
    });
}

// 초대 목록 렌더링
function renderInvitations() {
    const section = document.getElementById('workspaceInvitationsSection');
    const listContainer = document.getElementById('workspaceInvitationsList');
    if (!section || !listContainer) return;

    if (currentInvitations.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    listContainer.innerHTML = '';

    currentInvitations.forEach(ws => {
        const div = document.createElement('div');
        div.className = 'invitation-item';
        div.innerHTML = `
            <div class="invitation-header">
                <span class="invitation-badge">New</span>
                <p class="invitation-text"><b>${ws.name}</b> 워크스페이스 초대</p>
            </div>
            <div class="invitation-actions">
                <button class="btn-accept" onclick="respondInvitation('${ws._id}', 'accepted')">수락</button>
                <button class="btn-decline" onclick="respondInvitation('${ws._id}', 'declined')">거절</button>
            </div>
        `;
        listContainer.appendChild(div);
    });
}

// 초대 응답
async function respondInvitation(workspaceId, response) {
    try {
        const res = await fetch('/respond_to_invitation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, userId: loggedInUserId, response })
        });
        const data = await res.json();
        if (data.message === "1") {
            showNotification(response === 'accepted' ? "워크스페이스에 참여했습니다." : "초대를 거절했습니다.");
            loadWorkspaces();
            loadInvitations();
        }
    } catch (error) {
        console.error("Respond Invitation Error:", error);
    }
}

// --- 워크스페이스 생성 모달 핸들링 ---
const createWorkspaceModal = document.getElementById('createWorkspaceModal');
const openWorkspaceModalBtn = document.getElementById('openCreateWorkspaceModal');
const cancelWorkspaceBtn = document.getElementById('cancelWorkspaceBtn');
const submitWorkspaceBtn = document.getElementById('submitWorkspaceBtn');

if (openWorkspaceModalBtn) {
    openWorkspaceModalBtn.addEventListener('click', () => {
        createWorkspaceModal.style.display = 'flex';
    });
}

if (cancelWorkspaceBtn) {
    cancelWorkspaceBtn.addEventListener('click', () => {
        createWorkspaceModal.style.display = 'none';
        document.getElementById('workspaceNameInput').value = '';
    });
}

if (submitWorkspaceBtn) {
    submitWorkspaceBtn.addEventListener('click', async () => {
        const name = document.getElementById('workspaceNameInput').value.trim();
        if (!name) return alert("워크스페이스 이름을 입력하세요.");

        try {
            const response = await fetch('/create_workspace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, ownerId: loggedInUserId })
            });
            const data = await response.json();
            if (data.message === "1") {
                showNotification("워크스페이스가 생성되었습니다.");
                createWorkspaceModal.style.display = 'none';
                document.getElementById('workspaceNameInput').value = '';
                loadWorkspaces();
            }
        } catch (error) {
            console.error("Create Workspace Error:", error);
        }
    });
}

// --- 멤버 초대 모달 핸들링 ---
let currentInviteWorkspaceId = null;
function openInviteModal(id, name) {
    currentInviteWorkspaceId = id;
    const targetName = document.getElementById('targetWorkspaceName');
    if (targetName) targetName.textContent = `워크스페이스: ${name}`;
    const modal = document.getElementById('inviteMemberModal');
    if (modal) modal.style.display = 'flex';
}

const inviteMemberModal = document.getElementById('inviteMemberModal');
const cancelInviteBtn = document.getElementById('cancelInviteBtn');
const submitInviteBtn = document.getElementById('submitInviteBtn');

if (cancelInviteBtn) {
    cancelInviteBtn.addEventListener('click', () => {
        inviteMemberModal.style.display = 'none';
        document.getElementById('targetUserIdInput').value = '';
    });
}

if (submitInviteBtn) {
    submitInviteBtn.addEventListener('click', async () => {
        const targetUserId = document.getElementById('targetUserIdInput').value.trim();
        if (!targetUserId) return alert("초대할 사용자 ID를 입력하세요.");

        try {
            const response = await fetch('/invite_to_workspace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId: currentInviteWorkspaceId, targetUserId })
            });
            const data = await response.json();
            if (data.message === "1") {
                showNotification(`${targetUserId}님에게 초대를 보냈습니다.`);
                inviteMemberModal.style.display = 'none';
                document.getElementById('targetUserIdInput').value = '';
            } else {
                alert(data.error || "초대 실패");
            }
        } catch (error) {
            console.error("Invite Member Error:", error);
        }
    });
}

// --- 워크스페이스 상세 보기 ---
function openWorkspaceDetail(wsId) {
    const ws = currentWorkspaces.find(w => w._id === wsId);
    if (!ws) return;

    // UI 전환
    document.getElementById('workspaceHeader').style.display = 'none';
    document.getElementById('workspaceListSection').style.display = 'none';
    document.getElementById('workspaceInvitationsSection').style.display = 'none';
    const detailView = document.getElementById('workspaceDetailView');
    detailView.style.display = 'block';
    window.scrollTo(0, 0);

    // 내용 채우기
    document.getElementById('wsDetailName').textContent = ws.name;
    document.getElementById('wsDetailDesc').style.display = 'none'; // 설명 대신 노트 목록 표시

    // 워크스페이스 노트 렌더링
    const noteList = document.getElementById('wsNoteList');
    noteList.innerHTML = '';

    // 전역 userNotes 또는 fetch한 데이터에서 해당 워크스페이스의 노트를 필터링
    // userNotes가 전역으로 선언되어 있어야 함 (기존 loadUserNotes 참고)
    const wsNotes = currentNotes.filter(n => n.workspaceId === wsId);

    if (wsNotes.length === 0) {
        noteList.innerHTML = '<p style="color: #999; font-size: 13px; padding: 20px;">이 워크스페이스에 생성된 노트가 없습니다.</p>';
    } else {
        wsNotes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'ws-note-card';
            card.onclick = () => openNoteInEditor(note);
            card.innerHTML = `
                <div class="note-title">${note.title}</div>
                <div class="note-date">${new Date(note.createdAt || Date.now()).toLocaleDateString()}</div>
            `;
            noteList.appendChild(card);
        });
    }

    const membersList = document.getElementById('wsDetailMembers');
    membersList.innerHTML = '';

    ws.members.forEach(member => {
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `
            <div class="member-avatar">${member.userId.substring(0, 2).toUpperCase()}</div>
            <div class="member-info">
                <span class="member-name">${member.userId}</span>
                <span class="member-status">${member.status === 'accepted' ? '참여 중' : '대기 중'}</span>
            </div>
        `;
        membersList.appendChild(div);
    });

    // 버튼 이벤트 연결
    const leaveBtn = document.getElementById('leaveWorkspaceBtn');
    leaveBtn.onclick = async () => {
        if (confirm('워크스페이스에서 나가시겠습니까?')) {
            try {
                const res = await fetch('/respond_to_invitation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceId: ws._id, userId: loggedInUserId, response: 'declined' })
                });
                const data = await res.json();
                if (data.message === "1") {
                    showNotification("워크스페이스에서 나갔습니다.");
                    await loadWorkspaces(); // 목록 갱신
                    closeWorkspaceDetail();
                }
            } catch (error) {
                console.error("Leave Workspace Error:", error);
            }
        }
    };

    const inviteBtn = document.getElementById('inviteToWorkspaceBtn');
    inviteBtn.onclick = () => {
        openInviteModal(ws._id, ws.name);
    };
}

function closeWorkspaceDetail() {
    document.getElementById('workspaceDetailView').style.display = 'none';
    document.getElementById('workspaceHeader').style.display = 'flex';
    document.getElementById('workspaceListSection').style.display = 'block';
    window.scrollTo(0, 0);

    // 초대 목록이 있으면 다시 표시
    if (currentInvitations.length > 0) {
        document.getElementById('workspaceInvitationsSection').style.display = 'block';
    }
}

// 돌아가기 버튼 이벤트
document.getElementById('backToWorkspaceList').addEventListener('click', closeWorkspaceDetail);

// --- 노트 생성 모달 핸들링 업데이트 ---
function updateWorkspaceSelect() {
    const select = document.getElementById('noteWorkspaceSelect');
    if (!select) return;

    // 기본 옵션만 남기고 초기화
    select.innerHTML = '<option value="">(없음)</option>';

    const acceptedWorkspaces = currentWorkspaces.filter(ws =>
        ws.members.some(m => m.userId === loggedInUserId && m.status === 'accepted')
    );

    acceptedWorkspaces.forEach(ws => {
        const opt = document.createElement('option');
        opt.value = ws._id;
        opt.textContent = ws.name;
        select.appendChild(opt);
    });
}

const createNoteModal = document.getElementById('createNoteWithWorkspaceModal');
const cancelCreateNoteBtn = document.getElementById('cancelCreateNoteBtn');
const submitCreateNoteBtn = document.getElementById('submitCreateNoteBtn');
const noteWorkspaceSelect = document.getElementById('noteWorkspaceSelect');
const inviteAllOption = document.getElementById('inviteAllOption');

if (addNewNoteBtn) {
    addNewNoteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        updateWorkspaceSelect();
        createNoteModal.style.display = 'flex';
    };
}

if (noteWorkspaceSelect) {
    noteWorkspaceSelect.addEventListener('change', () => {
        if (noteWorkspaceSelect.value) {
            inviteAllOption.style.display = 'flex';
        } else {
            inviteAllOption.style.display = 'none';
        }
    });
}

if (cancelCreateNoteBtn) {
    cancelCreateNoteBtn.addEventListener('click', () => {
        createNoteModal.style.display = 'none';
        document.getElementById('noteTitleInput').value = '';
        document.getElementById('noteWorkspaceSelect').value = '';
        document.getElementById('inviteAllCheckbox').checked = false;
        inviteAllOption.style.display = 'none';
    });
}

if (submitCreateNoteBtn) {
    submitCreateNoteBtn.addEventListener('click', async () => {
        const titleInput = document.getElementById('noteTitleInput');
        const title = titleInput.value.trim();
        const workspaceSelect = document.getElementById('noteWorkspaceSelect');
        const workspaceId = workspaceSelect.value;
        const inviteAllCheckbox = document.getElementById('inviteAllCheckbox');
        const inviteAll = inviteAllCheckbox.checked;

        if (!title) return alert("제목을 입력해주세요.");

        try {
            const response = await fetch('/create_note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    userId: loggedInUserId,
                    workspaceId: workspaceId || null,
                    inviteAll: inviteAll
                }),
            });

            const data = await response.json();

            if (data.message === "1") {
                createNoteModal.style.display = 'none';
                titleInput.value = '';
                workspaceSelect.value = '';
                inviteAllCheckbox.checked = false;
                inviteAllOption.style.display = 'none';

                // 노트 목록 갱신 및 열기
                loadUserNotes(loggedInUserId);
                openNoteInEditor({ _id: data.noteId, title: data.title, contents: "" });
                showNotification("새 노트가 생성되었습니다.");
            }
        } catch (error) {
            console.error("Create Note Error:", error);
        }
    });
}
// --- 알림 표시 기능 ---
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 20px;
        z-index: 10005;
        font-size: 14px;
        animation: slideIn 0.3s ease-out, slideOut 0.3s ease-in 2.7s forwards;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * 에디터 내 커서 위치를 절대적인 텍스트 오프셋(글자 수)으로 반환하는 헬퍼
 */
function getCursorOffset(element) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    return preCaretRange.toString().length;
}

/**
 * 텍스트 오프셋을 기준으로 에디터 내 커서 위치를 복원하는 헬퍼
 */
function setCursorOffset(element, offset) {
    const selection = window.getSelection();
    const range = document.createRange();
    let currentOffset = 0;
    let found = false;

    function traverse(node) {
        if (found) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const nextOffset = currentOffset + node.length;
            if (offset <= nextOffset) {
                range.setStart(node, offset - currentOffset);
                range.collapse(true);
                found = true;
            }
            currentOffset = nextOffset;
        } else if (node.nodeName === 'BR') {
            // BR 태그도 한 글자로 취급할 수 있으나 toString()에는 반영 안 됨. 
            // 여기서는 단순 텍스트 기반으로 처리.
        } else {
            for (let i = 0; i < node.childNodes.length; i++) {
                traverse(node.childNodes[i]);
            }
        }
    }

    traverse(element);
    if (!found) {
        // 끝까지 못 찾으면 맨 뒤로
        range.selectNodeContents(element);
        range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
}

