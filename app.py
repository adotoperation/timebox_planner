import sys
import os
import webbrowser
import threading
import time
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import gspread
import json
from typing import List, Dict, Any
from google.oauth2.service_account import Credentials
from datetime import datetime

# Project directory setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = BASE_DIR
    return os.path.join(base_path, relative_path)

app = Flask(__name__, 
            static_url_path='',
            static_folder=resource_path('.'), 
            template_folder=resource_path('.'))
app.secret_key = 'timebox_secret_key_123'

# Global lock to prevent race conditions during Google Sheets Read-Modify-Write
sheet_lock = threading.Lock()

# Google Sheets Setup
SPREADSHEET_ID = '1k4yqDaxPUxWKp1QNDuK6ttOej1P2o7ZGk5QCAuAvSkM'
WORKSHEET_NAME = 'RDB'
USER_SHEET_NAME = 'RDB_로그인'

def get_sheet(sheet_name=WORKSHEET_NAME):
    try:
        cred_path = resource_path('credentials.json')
        if not os.path.exists(cred_path):
            return None
        scopes = ['https://www.googleapis.com/auth/spreadsheets']
        creds = Credentials.from_service_account_file(cred_path, scopes=scopes)
        client = gspread.authorize(creds)
        spreadsheet = client.open_by_key(SPREADSHEET_ID)
        
        try:
            sheet = spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            sheet = spreadsheet.add_worksheet(title=sheet_name, rows="100", cols="5")
            
        # Initialize headers if empty or different (only for main data sheet)
        if sheet_name == WORKSHEET_NAME:
            curr_vals = sheet.get_all_values()
            headers = ["User_ID", "ID", "Date", "Time", "Mission", "Status"]
            if not curr_vals:
                sheet.append_row(headers)
            elif curr_vals[0] != headers:
                sheet.clear()
                sheet.update('A1', [headers])
            
        # Initialize User sheet if needed
        if sheet_name == USER_SHEET_NAME:
            curr_vals = sheet.get_all_values()
            headers = ["Username", "Password"]
            if not curr_vals:
                sheet.append_row(headers)
            elif curr_vals[0] != headers:
                sheet.clear()
                sheet.update('A1', [headers])
            
        return sheet
    except Exception as e:
        print(f"Spreadsheet Error ({sheet_name}): {e}")
        return None

@app.route('/')
def index():
    if not session.get('logged_in'):
        return redirect(url_for('login'))
    return render_template('index.html', username=session.get('username'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json
        username = data.get('username')
        password = data.get('password')
        remember = data.get('remember', False)
        
        # Check against Google Sheet
        sheet = get_sheet(USER_SHEET_NAME)
        if not sheet:
            return jsonify({'success': False, 'error': '사용자 데이터베이스에 연결할 수 없습니다.'}), 500
            
        all_users = sheet.get_all_values()
        user_found = False
        for i, row in enumerate(all_users):
            if i == 0: continue
            if len(row) >= 2 and row[0] == username and row[1] == password:
                user_found = True
                break
        
        if user_found:
            session['logged_in'] = True
            session['username'] = username
            if remember:
                session.permanent = True
                app.permanent_session_lifetime = 60 * 60 * 24 * 30 # 30 days
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': '아이디 또는 비밀번호가 틀렸습니다.'}), 401
            
    return render_template('login.html')

@app.route('/api/check_id', methods=['POST'])
def check_id():
    data = request.json
    username = data.get('username')
    if not username:
        return jsonify({'success': False, 'error': '아이디를 입력해주세요.'}), 400
        
    sheet = get_sheet(USER_SHEET_NAME)
    if not sheet:
        return jsonify({'success': False, 'error': 'DB 연결 실패'}), 500
        
    all_users = sheet.get_all_values()
    exists = any(row[0] == username for i, row in enumerate(all_users) if i > 0 and len(row) > 0)
    
    if exists:
        return jsonify({'success': False, 'error': '이미 사용 중인 아이디입니다.'})
    return jsonify({'success': True})

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'success': False, 'error': '모든 필드를 입력해주세요.'}), 400
        
    sheet = get_sheet(USER_SHEET_NAME)
    if not sheet:
        return jsonify({'success': False, 'error': 'DB 연결 실패'}), 500
        
    all_users = sheet.get_all_values()
    if any(row[0] == username for i, row in enumerate(all_users) if i > 0 and len(row) > 0):
        return jsonify({'success': False, 'error': '이미 사용 중인 아이디입니다.'})
        
    sheet.append_row([username, password])
    return jsonify({'success': True})

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

def normalize_date(d_str):
    if not d_str: return ""
    d_str = str(d_str).strip()
    # Try parsing various formats
    formats = ['%Y-%m-%d', '%Y.%m.%d', '%Y.%m.%d.', '%Y/%m/%d', '%m/%d/%Y']
    for fmt in formats:
        try:
            return datetime.strptime(d_str, fmt).strftime('%Y-%m-%d')
        except:
            continue
    # If all fail, try manual cleaning for "2026. 3. 2."
    try:
        clean = d_str.replace(' ', '').strip('.')
        parts = clean.split('.')
        if len(parts) == 3:
            return f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
    except:
        pass
    return d_str

@app.route('/api/save', methods=['POST'])
def save_data():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'error': '로그인이 필요합니다.'}), 401
    
    username = session.get('username')
    data = request.json
    sheet = get_sheet()
    if not sheet:
        return jsonify({'success': False, 'error': 'Sheet connection failed'}), 500
    
    with sheet_lock:
        try:
            target_date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
            norm_target_date = normalize_date(target_date)
            
            all_values: List[Any] = sheet.get_all_values()
            header = ["User_ID", "ID", "Date", "Time", "Mission", "Status"]
            
            # 1. Keep rows that DON'T match this user AND this date
            new_sheet_content = [header]
            for i, row in enumerate(all_values):
                if i == 0: continue # Skip header
                if len(row) > 2:
                    row_user = row[0]
                    row_date = normalize_date(row[2])
                    if not (row_user == username and row_date == norm_target_date):
                        # Pad to 6 columns
                        row_data = list(row[:6])
                        while len(row_data) < 6:
                            row_data.append('')
                        new_sheet_content.append(row_data)

            # 2. Add current state as individual rows
            braindump_json = data.get('braindump', '[]')
            timebox = data.get('timebox', {})

            # Save Timebox
            for t_str, details in timebox.items():
                new_sheet_content.append([
                    username,
                    f"{norm_target_date}_{t_str.replace(':','')}", 
                    target_date, t_str, details.get('task', ''), 
                    'DONE' if details.get('completed') else 'TODO'
                ])
                
            # Save Brain Dump Items
            try:
                bd_list = json.loads(braindump_json)
                for i, item in enumerate(bd_list):
                    new_sheet_content.append([
                        username,
                        f"{norm_target_date}_BD_{i}", 
                        target_date, "BRAINDUMP", item.get('text', ''), 
                        'DONE' if item.get('checked') else 'TODO'
                    ])
            except: pass

            # Save Top 3
            top1 = data.get('top1', '')
            top2 = data.get('top2', '')
            top3 = data.get('top3', '')
            if top1: new_sheet_content.append([username, f"{norm_target_date}_TOP1", target_date, "TOP1", top1, "TODO"])
            if top2: new_sheet_content.append([username, f"{norm_target_date}_TOP2", target_date, "TOP2", top2, "TODO"])
            if top3: new_sheet_content.append([username, f"{norm_target_date}_TOP3", target_date, "TOP3", top3, "TODO"])

            # Update sheet
            sheet.clear()
            sheet.update('A1', new_sheet_content)
            return jsonify({'success': True})
        except Exception as e:
            print(f"Save Error: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/load', methods=['GET'])
def load_data():
    if not session.get('logged_in'):
        return jsonify({'success': False, 'error': '로그인이 필요합니다.'}), 401

    username = session.get('username')
    target_date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    norm_target_date = normalize_date(target_date)
    sheet = get_sheet()
    if not sheet:
        return jsonify({'success': False, 'error': 'Sheet connection failed'}), 500
    
    try:
        all_values = sheet.get_all_values()
        if len(all_values) < 2:
            return jsonify({'success': True, 'data': None})
        
        # Filter by User (Col A) and Date (Col C)
        target_rows = [r for r in all_values[1:] if len(r) > 2 and r[0] == username and normalize_date(r[2]) == norm_target_date]
        if not target_rows:
            return jsonify({'success': True, 'data': None})
        
        reconstructed: Dict[str, Any] = {
            'top1': '', 'top2': '', 'top3': '',
            'braindump_list': [],
            'timebox': {}
        }
        
        for r in target_rows:
            # New Row format: [User_ID, ID, Date, Time, Mission, Status]
            t_key = r[3] if len(r) > 3 else ""
            mission = r[4] if len(r) > 4 else ""
            status = r[5] if len(r) > 5 else ""
            
            if t_key == "BRAINDUMP":
                # Ensure the key exists and is a list
                bd_list_items = reconstructed.get('braindump_list', [])
                bd_list_items.append({
                    'text': mission,
                    'checked': status == "DONE"
                })
            elif t_key == "TOP1": reconstructed['top1'] = mission
            elif t_key == "TOP2": reconstructed['top2'] = mission
            elif t_key == "TOP3": reconstructed['top3'] = mission
            elif ":" in t_key or (t_key.isdigit() and len(t_key) >= 3):
                # Ensure timebox exists as a dict
                if 'timebox' not in reconstructed:
                    reconstructed['timebox'] = {}
                reconstructed['timebox'][t_key] = {
                    'task': mission,
                    'completed': status == "DONE"
                }
        
        # Convert braindump_list to JSON string for frontend compatibility if needed
        reconstructed['braindump'] = json.dumps(reconstructed['braindump_list'])  # type: ignore
        
        return jsonify({'success': True, 'data': reconstructed})
    except Exception as e:
        print(f"Load Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def open_browser():
    time.sleep(1.5)
    webbrowser.open("http://localhost:5005")

if __name__ == '__main__':
    print("\n" + "="*40)
    print(f"Timebox Planner starting...")
    print(f"Project Folder: {BASE_DIR}")
    print(f"Access at: http://localhost:5005")
    print("="*40 + "\n")
    
    if not os.environ.get("WERKZEUG_RUN_MAIN"):
        threading.Thread(target=open_browser).start()
    app.run(host='0.0.0.0', port=5005, debug=False)
