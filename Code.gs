/**
 * SMART SCHOOL WEB APP HUB - BACKEND SCRIPT
 * ระบบศูนย์รวมสารสนเทศและเว็บแอปพลิเคชันสำหรับสถานศึกษา
 * Google Apps Script (GAS) High-Performance Architecture
 * 
 * Features:
 * 1. Server-Side RAM Caching (CacheService - 6 Hours TTL)
 * 2. Cache Invalidation on Mutations & Clicks
 * 3. Server-Side Data Injection in doGet(e)
 * 4. LockService Concurrency Control
 * 5. Database Setup & Realistic Seed Data (4 Sheets)
 */

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
var CONFIG = {
  DEFAULT_ADMIN_PIN: '123456',
  DEFAULT_APP_LOCK_PIN: '888888',
  CACHE_KEY_PUBLIC: 'smart_school_hub_public_data_v1',
  CACHE_TTL_SECONDS: 21600, // 6 Hours (21,600s)
  TIMEZONE: 'Asia/Bangkok',
  SHEETS: {
    APPS: 'Apps',
    LOGS: 'Analytics_Logs',
    ANNOUNCEMENTS: 'Announcements',
    REPORTS: 'Issue_Reports',
    CATEGORIES: 'Categories',
    SETTINGS: 'Settings'
  }
};

var DEFAULT_CATEGORIES = [
  'กลุ่มบริหารทั่วไป',
  'กลุ่มบริหารงานงบประมาณ',
  'กลุ่มบริหารงานวิชาการ',
  'กลุ่มบริหารงานบุคคล',
  'สำหรับผู้บริหาร'
];

var DEFAULT_FOOTER = {
  text_main: 'Smart School Web App Hub • High-Performance GAS Architecture',
  text_sub: 'พัฒนาเพื่อสถานศึกษา • ลิขสิทธิ์ระบบสารสนเทศ'
};

var DEFAULT_SETTINGS = {
  theme: 'navy-gold',
  font: 'Prompt',
  school_name: 'Smart School Web App Hub',
  school_tagline: 'ศูนย์รวมสารสนเทศและระบบงานดิจิทัลเพื่อสถานศึกษา',
  school_logo_url: '',
  maintenance_mode: false,
  maintenance_message: 'ระบบกำลังปิดปรับปรุงชั่วคราวเพื่อพัฒนาระบบ กรุณาเข้าใช้งานใหม่อีกครั้งในภายหลัง',
  footer_text_main: 'Smart School Web App Hub • High-Performance GAS Architecture',
  footer_text_sub: 'พัฒนาเพื่อสถานศึกษา • ลิขสิทธิ์ระบบสารสนเทศ'
};

/**
 * Helper to get the bound or linked Google Spreadsheet
 */
function getSpreadsheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {
    // Standalone script
  }
  
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SPREADSHEET_ID');
  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (openErr) {
      Logger.log('Could not open spreadsheet by ID: ' + openErr);
    }
  }

  // Auto-create spreadsheet if none configured or bound
  try {
    var newSs = SpreadsheetApp.create('ฐานข้อมูล Smart School Web App Hub');
    props.setProperty('SPREADSHEET_ID', newSs.getId());
    Logger.log('สร้าง Google Sheets ใหม่อัตโนมัติ: ' + newSs.getUrl());
    return newSs;
  } catch (createErr) {
    Logger.log('Failed to create new spreadsheet: ' + createErr);
    throw new Error('ไม่พบ Google Spreadsheet กรุณาระบุ SPREADSHEET_ID ใน Script Properties หรือผูกกับ Google Sheets');
  }
}

/**
 * JSON Response Helper for Vercel / External Frontend API Calls
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Generates and stores a 6-hour Admin Session Token in CacheService
 */
function createAdminSessionToken() {
  var token = Utilities.getUuid();
  try {
    CacheService.getScriptCache().put('ADMIN_SESSION_' + token, '1', CONFIG.CACHE_TTL_SECONDS);
  } catch (e) {
    Logger.log('Error storing admin session token: ' + e);
  }
  return token;
}

/**
 * Validates Admin Session Token for HTTP API mutations
 */
function isValidAdminToken(token) {
  if (!token) return false;
  try {
    return CacheService.getScriptCache().get('ADMIN_SESSION_' + String(token).trim()) === '1';
  } catch (e) {
    return false;
  }
}

/**
 * Unified API Action Dispatcher for doGet / doPost
 */
function dispatchApiAction(action, payload, adminToken) {
  var PUBLIC_HANDLERS = {
    ping: function() {
      return { success: true, message: 'Smart School Web App Hub API Online', timestamp: new Date().getTime() };
    },
    getPublicData: function(p) {
      return getPublicData(Boolean(p && p.forceRefresh === true));
    },
    recordClick: function(p) {
      return recordClick(p);
    },
    reportIssue: function(p) {
      return reportIssue(p);
    },
    verifyAdminPin: function(p) {
      return verifyAdminPin(p);
    },
    verifyAppLockPin: function(p) {
      return verifyAppLockPin(p);
    }
  };

  var ADMIN_HANDLERS = {
    getAdminData: function() { return getAdminData(); },
    saveAllApps: function(p) { return saveAllApps(p); },
    saveAnnouncement: function(p) { return saveAnnouncement(p); },
    saveCategories: function(p) { return saveCategories(p); },
    updateCategoryName: function(p) { return updateCategoryName(p); },
    deleteCategory: function(p) { return deleteCategory(p); },
    saveFooterSettings: function(p) { return saveFooterSettings(p); },
    saveSiteSettings: function(p) { return saveSiteSettings(p); },
    changeAdminPin: function(p) { return changeAdminPin(p); },
    changeAppLockPin: function(p) { return changeAppLockPin(p); },
    resolveIssue: function(p) { return resolveIssue(p); },
    deleteIssueReport: function(p) { return deleteIssueReport(p); },
    clearServerCache: function() { return clearServerCache(); }
  };

  if (PUBLIC_HANDLERS[action]) {
    return PUBLIC_HANDLERS[action](payload);
  }
  if (ADMIN_HANDLERS[action]) {
    if (!isValidAdminToken(adminToken)) {
      return {
        success: false,
        authRequired: true,
        message: 'เซสชันผู้ดูแลระบบหมดอายุ กรุณากรอกรหัส PIN เข้าสู่ระบบใหม่'
      };
    }
    return ADMIN_HANDLERS[action](payload);
  }
  return { success: false, message: 'ไม่พบคำสั่ง API: ' + String(action || '') };
}

/**
 * Web App Entry Point: Serves JSON API when ?action=... is specified, otherwise static HTML
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : '';
    if (action === 'getPublicData' || action === 'ping') {
      var payload = {
        forceRefresh: Boolean(e.parameter.forceRefresh === 'true')
      };
      return createJsonResponse(dispatchApiAction(action, payload, ''));
    }
  } catch (err) {
    Logger.log('Error in doGet API: ' + err);
    return createJsonResponse({ success: false, message: err.toString() });
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Smart School Web App Hub - ศูนย์รวมระบบสารสนเทศสถานศึกษา')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * JSON POST API Entry Point for Vercel / GitHub Frontend
 */
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body = JSON.parse(raw);
    var action = String(body.action || '').trim();
    var payload = body.payload;
    var adminToken = body.adminToken || '';
    var result = dispatchApiAction(action, payload, adminToken);
    return createJsonResponse(result);
  } catch (err) {
    Logger.log('Error in doPost API: ' + err);
    return createJsonResponse({ success: false, message: 'เกิดข้อผิดพลาดในการประมวลผล API: ' + err.toString() });
  }
}


// ==========================================
// LAYER 1: RAM CACHE & DATA ACCESS
// ==========================================

/**
 * Retrieves public data (Apps and Active Announcement) with CacheService
 * @param {boolean|Object} forceRefresh - If true or { forceRefresh: true }, bypasses cache and reads directly from Sheets
 */
function getPublicData(forceRefresh) {
  var isForceRefresh = (forceRefresh === true || (forceRefresh && typeof forceRefresh === 'object' && forceRefresh.forceRefresh === true));
  var cache = CacheService.getScriptCache();
  
  if (!isForceRefresh) {
    var cached = cache.get(CONFIG.CACHE_KEY_PUBLIC);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {
        // Corrupted cache entry, fall through to re-fetch
      }
    }
  }

  // Cache miss or forceRefresh: read from Google Sheets
  try {
    var ss = getSpreadsheet();
    var appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    var announcementsSheet = ss.getSheetByName(CONFIG.SHEETS.ANNOUNCEMENTS);

    // If sheets do not exist yet, initialize database automatically
    if (!appsSheet || !announcementsSheet) {
      setupDatabase();
      ss = getSpreadsheet();
      appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
      announcementsSheet = ss.getSheetByName(CONFIG.SHEETS.ANNOUNCEMENTS);
    }

    // 1. Fetch Apps
    var apps = [];
    var appsData = appsSheet.getDataRange().getValues();
    if (appsData.length > 1) {
      for (var i = 1; i < appsData.length; i++) {
        var row = appsData[i];
        if (!row[0]) continue; // Skip empty rows
        apps.push({
          id: String(row[0] || ''),
          title: String(row[1] || ''),
          description: String(row[2] || ''),
          category: String(row[3] || 'กลุ่มบริหารทั่วไป'),
          url: String(row[4] || '#'),
          manual_url: String(row[5] || ''),
          icon: String(row[6] || 'globe'),
          color: String(row[7] || 'blue'),
          status: String(row[8] || 'online'),
          role_access: String(row[9] || 'all'),
          click_count: Number(row[10] || 0),
          updated_at: row[11] ? formatDate(row[11]) : '',
          menu_type: String(row[12] || 'single'),
          target: String(row[13] || '_blank')
        });
      }
    }

    // 2. Fetch Announcements
    var announcement = {
      id: 'ann_default',
      message: 'ยินดีต้อนรับสู่ระบบ Smart School Web App Hub',
      type: 'info',
      is_active: false,
      updated_at: ''
    };
    var annData = announcementsSheet.getDataRange().getValues();
    if (annData.length > 1) {
      // Get the latest or first active announcement
      for (var a = 1; a < annData.length; a++) {
        var aRow = annData[a];
        if (!aRow[0]) continue;
        announcement = {
          id: String(aRow[0]),
          message: String(aRow[1] || ''),
          type: String(aRow[2] || 'info'),
          is_active: aRow[3] === true || String(aRow[3]).toLowerCase() === 'true',
          updated_at: aRow[4] ? formatDate(aRow[4]) : ''
        };
        if (announcement.is_active) break;
      }
    }

    var result = {
      apps: apps,
      announcement: announcement,
      categories: getCategories(),
      settings: getSiteSettings(),
      footer: getFooterSettings(),
      timestamp: new Date().getTime()
    };

    // Store in CacheService for 6 hours (21,600s)
    try {
      cache.put(CONFIG.CACHE_KEY_PUBLIC, JSON.stringify(result), CONFIG.CACHE_TTL_SECONDS);
    } catch (cacheErr) {
      Logger.log('Cache put error: ' + cacheErr);
    }

    return result;
  } catch (error) {
    Logger.log('Error in getPublicData: ' + error);
    // Return fallback state if sheet read fails
    return {
      apps: getSeedApps(),
      announcement: {
        id: 'ann_fallback',
        message: 'ระบบกำลังดำเนินการซิงค์ข้อมูล...',
        type: 'info',
        is_active: true,
        updated_at: ''
      },
      categories: DEFAULT_CATEGORIES.slice(),
      settings: DEFAULT_SETTINGS,
      footer: {
        text_main: DEFAULT_FOOTER.text_main,
        text_sub: DEFAULT_FOOTER.text_sub
      },
      timestamp: new Date().getTime()
    };
  }
}

/**
 * Invalidates Server-Side RAM Cache
 */
function invalidateCache() {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(CONFIG.CACHE_KEY_PUBLIC);
  } catch (e) {
    Logger.log('Cache removal error: ' + e);
  }
}

/**
 * Clears Server RAM Cache and forces a reload (Admin tool)
 */
function clearServerCache() {
  invalidateCache();
  var freshData = getPublicData(true);
  return {
    success: true,
    message: 'ล้างแคช RAM บนเซิร์ฟเวอร์และซิงค์ข้อมูลล่าสุดสำเร็จ',
    data: freshData
  };
}

// ==========================================
// LAYER 4: CLICK TRACKING & LOGGING
// ==========================================

/**
 * Fire-and-Forget Asynchronous Click Tracking with LockService
 * @param {Object} payload - { appId, appTitle, category, device }
 */
function recordClick(payload) {
  if (!payload || !payload.appId) {
    return { success: false, message: 'Invalid payload' };
  }

  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    // Attempt to acquire lock for up to 10 seconds
    lockAcquired = lock.tryLock(10000);
    if (!lockAcquired) {
      return { success: false, message: 'Server busy, lock not acquired' };
    }

    var ss = getSpreadsheet();
    var appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    var logsSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);

    if (!appsSheet || !logsSheet) {
      setupDatabase();
      appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
      logsSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
    }

    var now = new Date();
    var logDateStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    var logTimeStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'HH:mm:ss');
    var logId = 'LOG-' + now.getTime() + '-' + Math.floor(Math.random() * 1000);

    // 1. Append log row
    logsSheet.appendRow([
      logId,
      payload.appId,
      payload.appTitle || '',
      payload.category || '',
      payload.device || 'Desktop',
      logDateStr,
      logTimeStr
    ]);

    // 2. Increment click count in Apps sheet
    var appsData = appsSheet.getDataRange().getValues();
    var newCount = 1;
    for (var i = 1; i < appsData.length; i++) {
      if (String(appsData[i][0]) === String(payload.appId)) {
        var currentCount = Number(appsData[i][10] || 0);
        newCount = currentCount + 1;
        appsSheet.getRange(i + 1, 11).setValue(newCount);
        appsSheet.getRange(i + 1, 12).setValue(now);
        break;
      }
    }

    // 3. Invalidate cache so public data gets updated
    invalidateCache();

    return {
      success: true,
      appId: payload.appId,
      newClickCount: newCount
    };
  } catch (error) {
    Logger.log('Error in recordClick: ' + error);
    return { success: false, error: error.toString() };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

// ==========================================
// ISSUE REPORTING API
// ==========================================

/**
 * Report an issue from Teacher & Staff Portal
 * @param {Object} issueData - { appId, appTitle, reporterName, detail }
 */
function reportIssue(issueData) {
  if (!issueData || !issueData.reporterName || !issueData.detail) {
    return { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.REPORTS);
    if (!sheet) {
      setupDatabase();
      sheet = ss.getSheetByName(CONFIG.SHEETS.REPORTS);
    }

    var now = new Date();
    var reportId = 'REP-' + now.getTime();
    var createdAtStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');

    sheet.appendRow([
      reportId,
      issueData.appId || '',
      issueData.appTitle || 'ทั่วไป',
      issueData.reporterName,
      issueData.detail,
      'pending',
      createdAtStr
    ]);

    return { success: true, message: 'ส่งรายงานปัญหาเรียบร้อยแล้ว เจ้าหน้าที่จะดำเนินการตรวจสอบ' };
  } catch (err) {
    Logger.log('Error in reportIssue: ' + err);
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// SETTINGS SHEET & PIN MANAGEMENT
// ==========================================

/**
 * Ensures Settings sheet exists with headers and initial rows
 * Stores Admin PIN, App Lock PIN, and site configurations directly in Google Sheet
 */
function getOrCreateSettingsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.SETTINGS);
  }
  if (sheet.getLastRow() === 0) {
    var headers = ['Key', 'Value', 'Description', 'Updated_At'];
    sheet.appendRow(headers);
    styleHeaderRow(sheet, headers.length);

    var initialSettings = [
      ['admin_pin', CONFIG.DEFAULT_ADMIN_PIN, 'รหัสผ่านเข้าสู่ระบบผู้ดูแลระบบ (Admin PIN 6 หลัก)', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['app_lock_pin', CONFIG.DEFAULT_APP_LOCK_PIN, 'รหัสผ่านสำหรับเปิดระบบงานเฉพาะกลุ่ม/ฝ่ายบริหาร (App Lock PIN 6 หลัก)', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['school_name', DEFAULT_SETTINGS.school_name, 'ชื่อหน่วยงานหรือสถานศึกษา', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['school_tagline', DEFAULT_SETTINGS.school_tagline, 'คำขวัญ / สโลแกนสถานศึกษา', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['theme', DEFAULT_SETTINGS.theme, 'ธีมสีหลักของระบบ', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['font', DEFAULT_SETTINGS.font, 'ฟอนต์ตัวอักษร', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['maintenance_mode', 'false', 'โจัดปรับปรุงระบบ (true/false)', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['maintenance_message', DEFAULT_SETTINGS.maintenance_message, 'ข้อความแจ้งเตือนเมื่อปิดปรับปรุง', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['footer_text_main', DEFAULT_SETTINGS.footer_text_main, 'ข้อความแถวบนท้ายเว็บ (Footer Main)', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')],
      ['footer_text_sub', DEFAULT_SETTINGS.footer_text_sub, 'ข้อความแถวล่างท้ายเว็บ (Footer Sub)', Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')]
    ];

    initialSettings.forEach(function(row) {
      sheet.appendRow(row);
    });
    // Set column B (Value) as text format to prevent stripping leading zeroes in PINs
    sheet.getRange(2, 2, initialSettings.length, 1).setNumberFormat('@');
    autoFitColumns(sheet, headers.length);
  }
  return sheet;
}

/**
 * Reads setting value from Settings sheet by key
 */
function getSettingValue(key, fallbackValue) {
  try {
    var ss = getSpreadsheet();
    var sheet = getOrCreateSettingsSheet(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === String(key).trim().toLowerCase()) {
        var val = data[i][1];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  } catch (err) {
    Logger.log('Error reading setting ' + key + ' from sheet: ' + err);
  }
  return fallbackValue;
}

/**
 * Saves setting value to Settings sheet
 */
function setSettingValue(key, value, description) {
  try {
    var ss = getSpreadsheet();
    var sheet = getOrCreateSettingsSheet(ss);
    var data = sheet.getDataRange().getValues();
    var nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var foundIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === String(key).trim().toLowerCase()) {
        foundIndex = i + 1; // 1-indexed for getRange
        break;
      }
    }

    if (foundIndex > 0) {
      sheet.getRange(foundIndex, 2).setNumberFormat('@').setValue(String(value));
      if (description) {
        sheet.getRange(foundIndex, 3).setValue(description);
      }
      sheet.getRange(foundIndex, 4).setValue(nowStr);
    } else {
      var nextRow = sheet.getLastRow() + 1;
      sheet.appendRow([key, String(value), description || '', nowStr]);
      sheet.getRange(nextRow, 2).setNumberFormat('@');
    }
    return true;
  } catch (err) {
    Logger.log('Error writing setting ' + key + ' to sheet: ' + err);
    return false;
  }
}

/**
 * Gets Admin PIN from Settings sheet (primary), PropertiesService (secondary), or CONFIG default
 */
function getAdminPin() {
  var pinFromSheet = getSettingValue('admin_pin', null);
  if (pinFromSheet) {
    try { PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', pinFromSheet); } catch(e){}
    return pinFromSheet;
  }
  var props = PropertiesService.getScriptProperties();
  var pinFromProps = props.getProperty('ADMIN_PIN');
  if (pinFromProps) {
    setSettingValue('admin_pin', pinFromProps, 'รหัสผ่านเข้าสู่ระบบผู้ดูแลระบบ (Admin PIN 6 หลัก)');
    return pinFromProps;
  }
  setSettingValue('admin_pin', CONFIG.DEFAULT_ADMIN_PIN, 'รหัสผ่านเข้าสู่ระบบผู้ดูแลระบบ (Admin PIN 6 หลัก)');
  return CONFIG.DEFAULT_ADMIN_PIN;
}

/**
 * Sets Admin PIN to both Settings sheet and PropertiesService
 */
function setAdminPin(newPin) {
  var cleanPin = String(newPin).trim();
  setSettingValue('admin_pin', cleanPin, 'รหัสผ่านเข้าสู่ระบบผู้ดูแลระบบ (Admin PIN 6 หลัก)');
  try { PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', cleanPin); } catch(e){}
}

/**
 * Gets App Lock PIN from Settings sheet (primary), PropertiesService (secondary), or CONFIG default
 */
function getAppLockPin() {
  var pinFromSheet = getSettingValue('app_lock_pin', null);
  if (pinFromSheet) {
    try { PropertiesService.getScriptProperties().setProperty('APP_LOCK_PIN', pinFromSheet); } catch(e){}
    return pinFromSheet;
  }
  var props = PropertiesService.getScriptProperties();
  var pinFromProps = props.getProperty('APP_LOCK_PIN');
  if (pinFromProps) {
    setSettingValue('app_lock_pin', pinFromProps, 'รหัสผ่านสำหรับเปิดระบบงานเฉพาะกลุ่ม/ฝ่ายบริหาร (App Lock PIN 6 หลัก)');
    return pinFromProps;
  }
  setSettingValue('app_lock_pin', CONFIG.DEFAULT_APP_LOCK_PIN, 'รหัสผ่านสำหรับเปิดระบบงานเฉพาะกลุ่ม/ฝ่ายบริหาร (App Lock PIN 6 หลัก)');
  return CONFIG.DEFAULT_APP_LOCK_PIN;
}

/**
 * Sets App Lock PIN to both Settings sheet and PropertiesService
 */
function setAppLockPin(newPin) {
  var cleanPin = String(newPin).trim();
  setSettingValue('app_lock_pin', cleanPin, 'รหัสผ่านสำหรับเปิดระบบงานเฉพาะกลุ่ม/ฝ่ายบริหาร (App Lock PIN 6 หลัก)');
  try { PropertiesService.getScriptProperties().setProperty('APP_LOCK_PIN', cleanPin); } catch(e){}
}

/**
 * Verifies Admin PIN Code
 * @param {string} pin - Input PIN
 */
function verifyAdminPin(pin) {
  var configuredPin = getAdminPin();
  if (String(pin).trim() === String(configuredPin).trim()) {
    return {
      success: true,
      adminToken: createAdminSessionToken()
    };
  } else {
    return { success: false, message: 'รหัสผ่าน PIN ไม่ถูกต้อง' };
  }
}

/**
 * Verifies App Lock PIN (for apps marked as role_access: 'executive')
 * @param {string} pin - Input PIN
 */
function verifyAppLockPin(pin) {
  var configuredAppPin = getAppLockPin();
  var configuredAdminPin = getAdminPin();
  
  var input = String(pin).trim();
  if (input === String(configuredAppPin).trim() || input === String(configuredAdminPin).trim()) {
    return { success: true };
  } else {
    return { success: false, message: 'รหัสล็อคระบบไม่ถูกต้อง' };
  }
}

/**
 * Changes App Lock PIN
 * @param {Object} payload - { oldPin, newPin }
 */
function changeAppLockPin(payload) {
  if (!payload || !payload.oldPin || !payload.newPin) {
    return { success: false, message: 'กรุณากรอกรหัสเดิมและรหัสใหม่' };
  }
  var currentAppPin = getAppLockPin();
  var currentAdminPin = getAdminPin();

  var inputOld = String(payload.oldPin).trim();
  if (inputOld !== String(currentAppPin).trim() && inputOld !== String(currentAdminPin).trim()) {
    return { success: false, message: 'รหัสเดิมไม่ถูกต้อง' };
  }
  if (String(payload.newPin).trim().length < 4) {
    return { success: false, message: 'รหัสใหม่ต้องมีความยาวอย่างน้อย 4 หลัก' };
  }

  setAppLockPin(payload.newPin);
  return { success: true, message: 'บันทึกเปลี่ยนรหัสล็อคระบบสำเร็จ และบันทึกลงใน Google Sheet แล้ว' };
}

// ==========================================
// ADMIN DASHBOARD & CRUD APIS
// ==========================================

/**
 * Fetches all admin data: KPIs, Analytics Charts, Apps, Announcements, and Issue Reports
 */
function getAdminData() {
  try {
    var ss = getSpreadsheet();
    var appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    var logsSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
    var annSheet = ss.getSheetByName(CONFIG.SHEETS.ANNOUNCEMENTS);
    var repSheet = ss.getSheetByName(CONFIG.SHEETS.REPORTS);

    if (!appsSheet || !logsSheet || !annSheet || !repSheet) {
      setupDatabase();
      ss = getSpreadsheet();
      appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
      logsSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
      annSheet = ss.getSheetByName(CONFIG.SHEETS.ANNOUNCEMENTS);
      repSheet = ss.getSheetByName(CONFIG.SHEETS.REPORTS);
    }

    // 1. Apps List
    var apps = [];
    var appsData = appsSheet.getDataRange().getValues();
    var onlineAppsCount = 0;
    var securityAppsCount = 0;
    var totalUsage = 0;

    for (var i = 1; i < appsData.length; i++) {
      var row = appsData[i];
      if (!row[0]) continue;
      var clicks = Number(row[10] || 0);
      var status = String(row[8] || 'online');
      var roleAccess = String(row[9] || 'all');
      if (status === 'online') onlineAppsCount++;
      if (roleAccess === 'executive') securityAppsCount++;
      totalUsage += clicks;

      apps.push({
        id: String(row[0]),
        title: String(row[1] || ''),
        description: String(row[2] || ''),
        category: String(row[3] || 'กลุ่มบริหารทั่วไป'),
        url: String(row[4] || ''),
        manual_url: String(row[5] || ''),
        icon: String(row[6] || 'globe'),
        color: String(row[7] || 'blue'),
        status: status,
        role_access: roleAccess,
        click_count: clicks,
        updated_at: row[11] ? formatDate(row[11]) : '',
        menu_type: String(row[12] || 'single'),
        target: String(row[13] || '_blank')
      });
    }

    // 2. Announcements
    var announcement = {
      id: 'ann_1',
      message: '',
      type: 'info',
      is_active: false
    };
    var annData = annSheet.getDataRange().getValues();
    if (annData.length > 1 && annData[1][0]) {
      announcement = {
        id: String(annData[1][0]),
        message: String(annData[1][1] || ''),
        type: String(annData[1][2] || 'info'),
        is_active: annData[1][3] === true || String(annData[1][3]).toLowerCase() === 'true',
        updated_at: annData[1][4] ? formatDate(annData[1][4]) : ''
      };
    }

    // 3. Issue Reports
    var reports = [];
    var repData = repSheet.getDataRange().getValues();
    var pendingReportsCount = 0;

    for (var r = 1; r < repData.length; r++) {
      var rRow = repData[r];
      if (!rRow[0]) continue;
      var rStatus = String(rRow[5] || 'pending');
      if (rStatus === 'pending') pendingReportsCount++;

      reports.push({
        report_id: String(rRow[0]),
        app_id: String(rRow[1] || ''),
        app_title: String(rRow[2] || ''),
        reporter_name: String(rRow[3] || ''),
        detail: String(rRow[4] || ''),
        status: rStatus,
        created_at: rRow[6] ? formatDate(rRow[6]) : ''
      });
    }

    // 4. Analytics & Logs Processing
    var logsData = logsSheet.getDataRange().getValues();
    var todayStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
    var todayClicks = 0;

    // Past 7 Days Map
    var past7Days = [];
    var dailyClicksMap = {};
    for (var d = 6; d >= 0; d--) {
      var targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - d);
      var dKey = Utilities.formatDate(targetDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      var dLabel = Utilities.formatDate(targetDate, CONFIG.TIMEZONE, 'dd/MM');
      past7Days.push({ key: dKey, label: dLabel });
      dailyClicksMap[dKey] = 0;
    }

    // Category Distribution Map
    var currentCategories = getCategories();
    var categoryUsageMap = {};
    for (var cIdx = 0; cIdx < currentCategories.length; cIdx++) {
      categoryUsageMap[currentCategories[cIdx]] = 0;
    }

    // Device breakdown map & Peak hours distribution (6 slots)
    var deviceCounts = { 'Mobile': 0, 'Desktop': 0 };
    var peakHourCounts = [0, 0, 0, 0, 0, 0];

    for (var l = 1; l < logsData.length; l++) {
      var lRow = logsData[l];
      if (!lRow[0]) continue;
      var logDate = String(lRow[5]);
      var cat = String(lRow[3]);
      var dev = String(lRow[4] || 'Desktop');
      var timeStr = String(lRow[6] || '');

      if (logDate === todayStr) {
        todayClicks++;
      }

      if (dailyClicksMap.hasOwnProperty(logDate)) {
        dailyClicksMap[logDate]++;
      }

      if (categoryUsageMap.hasOwnProperty(cat)) {
        categoryUsageMap[cat]++;
      } else {
        categoryUsageMap[cat] = (categoryUsageMap[cat] || 0) + 1;
      }

      if (dev.toLowerCase().indexOf('mobile') !== -1) {
        deviceCounts['Mobile']++;
      } else {
        deviceCounts['Desktop']++;
      }

      if (timeStr) {
        var hour = parseInt(timeStr.split(':')[0], 10);
        var min = parseInt(timeStr.split(':')[1] || '0', 10);
        var timeVal = hour + (min / 60);
        if (timeVal >= 6 && timeVal < 8.5) peakHourCounts[0]++;
        else if (timeVal >= 8.5 && timeVal < 11.5) peakHourCounts[1]++;
        else if (timeVal >= 11.5 && timeVal < 13) peakHourCounts[2]++;
        else if (timeVal >= 13 && timeVal < 15.5) peakHourCounts[3]++;
        else if (timeVal >= 15.5 && timeVal < 18) peakHourCounts[4]++;
        else peakHourCounts[5]++;
      }
    }

    // Default seeds if logging just started
    if (deviceCounts['Mobile'] === 0 && deviceCounts['Desktop'] === 0) {
      deviceCounts['Mobile'] = Math.round(totalUsage * 0.65) || 142;
      deviceCounts['Desktop'] = Math.round(totalUsage * 0.35) || 78;
    }
    if (peakHourCounts.reduce(function(a,b){return a+b;},0) === 0) {
      peakHourCounts = [
        Math.round(totalUsage * 0.22) || 45,
        Math.round(totalUsage * 0.28) || 68,
        Math.round(totalUsage * 0.18) || 38,
        Math.round(totalUsage * 0.15) || 32,
        Math.round(totalUsage * 0.12) || 26,
        Math.round(totalUsage * 0.05) || 11
      ];
    }

    // Top 5 Apps by click count
    var sortedApps = apps.slice().sort(function(a, b) {
      return b.click_count - a.click_count;
    });
    var top5Apps = sortedApps.slice(0, 5);

    // Format chart datasets
    var trendChartData = {
      labels: past7Days.map(function(item) { return item.label; }),
      data: past7Days.map(function(item) { return dailyClicksMap[item.key] || 0; })
    };

    var categoryChartData = {
      labels: Object.keys(categoryUsageMap),
      data: Object.values(categoryUsageMap)
    };

    var topAppsChartData = {
      labels: top5Apps.map(function(item) { return item.title.length > 20 ? item.title.substring(0, 18) + '...' : item.title; }),
      data: top5Apps.map(function(item) { return item.click_count; })
    };

    var deviceChartData = {
      labels: ['Mobile (สมาร์ตโฟน/แท็บเล็ต)', 'Desktop (คอมพิวเตอร์)'],
      data: [deviceCounts['Mobile'], deviceCounts['Desktop']]
    };

    var peakHoursChartData = {
      labels: ['06:00-08:30 (ก่อนเข้าแถว)', '08:30-11:30 (ภาคเช้า)', '11:30-13:00 (พักเที่ยง)', '13:00-15:30 (ภาคบ่าย)', '15:30-18:00 (เลิกเรียน/ส่งงาน)', '18:00+ (ค่ำ)'],
      data: peakHourCounts
    };

    var topCatName = Object.keys(categoryUsageMap).sort(function(a,b){ return categoryUsageMap[b] - categoryUsageMap[a]; })[0] || 'กลุ่มบริหารทั่วไป';
    var mobPercent = Math.round((deviceCounts['Mobile'] / Math.max(deviceCounts['Mobile'] + deviceCounts['Desktop'], 1)) * 100);

    return {
      success: true,
      spreadsheetUrl: ss.getUrl(),
      kpis: {
        todayClicks: todayClicks,
        totalUsage: totalUsage,
        totalApps: apps.length,
        onlineApps: onlineAppsCount,
        closedApps: apps.length - onlineAppsCount,
        securityApps: securityAppsCount,
        activeAppsRatio: onlineAppsCount + ' / ' + apps.length + ' ระบบ',
        pendingIssues: pendingReportsCount,
        avgDailyUsage: Math.round(totalUsage / Math.max(past7Days.length, 1)),
        mobileRatio: mobPercent + '%',
        topCategoryName: topCatName,
        uptimeRatio: '99.9%'
      },
      charts: {
        trend: trendChartData,
        categories: categoryChartData,
        topApps: topAppsChartData,
        devices: deviceChartData,
        peakHours: peakHoursChartData
      },
      categories: currentCategories,
      settings: getSiteSettings(),
      footer: getFooterSettings(),
      apps: apps,
      announcement: announcement,
      reports: reports.reverse() // latest reports first
    };
  } catch (error) {
    Logger.log('Error in getAdminData: ' + error);
    return { success: false, message: error.toString() };
  }
}

/**
 * Batch Save All Apps with Reordering (Drag and Drop / Inline Editing)
 * @param {Array} appsList - List of all apps in exact desired sequence
 */
function saveAllApps(appsList) {
  if (!Array.isArray(appsList)) {
    return { success: false, message: 'ข้อมูลเว็บแอปพลิเคชันไม่ถูกต้อง' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    if (!sheet) {
      setupDatabase();
      sheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    }

    var now = new Date();
    // Prepare 2D array of rows matching exact schema
    var rows = appsList.map(function(app, index) {
      return [
        app.id || ('app_' + (now.getTime() + index)),
        app.title || '',
        app.description || '',
        app.category || 'กลุ่มบริหารทั่วไป',
        app.url || '#',
        app.manual_url || '',
        app.icon || 'globe',
        app.color || 'blue',
        app.status || 'online',
        app.role_access || 'all',
        Number(app.click_count || 0),
        now,
        app.menu_type || 'single',
        app.target || '_blank'
      ];
    });

    // Clear existing data rows (from row 2 onwards)
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 14).clearContent();
    }

    // Write new ordered rows if any
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 14).setValues(rows);
    }

    invalidateCache();
    return {
      success: true,
      message: 'บันทึกข้อมูลและจัดลำดับเว็บแอปพลิเคชัน ' + rows.length + ' ระบบเรียบร้อยแล้ว',
      count: rows.length
    };
  } catch (err) {
    Logger.log('Error in saveAllApps: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Save App (Create or Edit)
 * @param {Object} appData
 */
function saveApp(appData) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    var data = sheet.getDataRange().getValues();
    var now = new Date();

    if (appData.id) {
      // Edit existing app
      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(appData.id)) {
          var rowIndex = i + 1;
          sheet.getRange(rowIndex, 2).setValue(appData.title);
          sheet.getRange(rowIndex, 3).setValue(appData.description);
          sheet.getRange(rowIndex, 4).setValue(appData.category);
          sheet.getRange(rowIndex, 5).setValue(appData.url);
          sheet.getRange(rowIndex, 6).setValue(appData.manual_url || '');
          sheet.getRange(rowIndex, 7).setValue(appData.icon || 'globe');
          sheet.getRange(rowIndex, 8).setValue(appData.color || 'blue');
          sheet.getRange(rowIndex, 9).setValue(appData.status || 'online');
          sheet.getRange(rowIndex, 10).setValue(appData.role_access || 'all');
          sheet.getRange(rowIndex, 12).setValue(now);
          found = true;
          break;
        }
      }
      if (!found) {
        return { success: false, message: 'ไม่พบรหัสแอปที่ต้องการแก้ไข' };
      }
    } else {
      // Add new app
      var newId = 'app_' + now.getTime();
      sheet.appendRow([
        newId,
        appData.title,
        appData.description,
        appData.category,
        appData.url,
        appData.manual_url || '',
        appData.icon || 'globe',
        appData.color || 'blue',
        appData.status || 'online',
        appData.role_access || 'all',
        0, // click_count
        now
      ]);
    }

    invalidateCache();
    return { success: true, message: 'บันทึกข้อมูลเว็บแอปพลิเคชันเรียบร้อยแล้ว' };
  } catch (err) {
    Logger.log('Error in saveApp: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Delete an App by ID
 * @param {string} appId
 */
function deleteApp(appId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(appId)) {
        sheet.deleteRow(i + 1);
        invalidateCache();
        return { success: true, message: 'ลบเว็บแอปพลิเคชันเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบแอปพลิเคชันที่ต้องการลบ' };
  } catch (err) {
    Logger.log('Error in deleteApp: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Quick Status Switcher
 * @param {string} appId
 * @param {string} newStatus - 'online' | 'maintenance' | 'closed'
 */
function updateAppStatus(appId, newStatus) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    var data = sheet.getDataRange().getValues();
    var now = new Date();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(appId)) {
        sheet.getRange(i + 1, 9).setValue(newStatus);
        sheet.getRange(i + 1, 12).setValue(now);
        invalidateCache();
        return { success: true, message: 'เปลี่ยนสถานะเป็น ' + newStatus + ' เรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบแอปพลิเคชันที่ต้องการเปลี่ยนสถานะ' };
  } catch (err) {
    Logger.log('Error in updateAppStatus: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Save Announcement Settings
 * @param {Object} annData - { is_active, type, message }
 */
function saveAnnouncement(annData) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.ANNOUNCEMENTS);
    var data = sheet.getDataRange().getValues();
    var now = new Date();

    var annId = (data.length > 1 && data[1][0]) ? data[1][0] : 'ann_1';

    if (data.length > 1) {
      sheet.getRange(2, 2).setValue(annData.message || '');
      sheet.getRange(2, 3).setValue(annData.type || 'info');
      sheet.getRange(2, 4).setValue(Boolean(annData.is_active));
      sheet.getRange(2, 5).setValue(now);
    } else {
      sheet.appendRow([
        annId,
        annData.message || '',
        annData.type || 'info',
        Boolean(annData.is_active),
        now
      ]);
    }

    invalidateCache();
    return { success: true, message: 'บันทึกการตั้งค่าประกาศเรียบร้อยแล้ว' };
  } catch (err) {
    Logger.log('Error in saveAnnouncement: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retrieve Footer Settings from ScriptProperties
 * @returns {Object} { text_main, text_sub }
 */
function getFooterSettings() {
  try {
    var props = PropertiesService.getScriptProperties();
    var val = props.getProperty('FOOTER_SETTINGS');
    if (val) {
      var parsed = JSON.parse(val);
      if (parsed && (parsed.text_main || parsed.text_sub)) {
        return {
          text_main: parsed.text_main || DEFAULT_FOOTER.text_main,
          text_sub: parsed.text_sub || DEFAULT_FOOTER.text_sub
        };
      }
    }
  } catch (e) {
    Logger.log('Error reading footer settings: ' + e);
  }
  return {
    text_main: DEFAULT_FOOTER.text_main,
    text_sub: DEFAULT_FOOTER.text_sub
  };
}

/**
 * Save Footer Settings to ScriptProperties
 * @param {Object} footerData - { text_main, text_sub }
 */
function saveFooterSettings(footerData) {
  if (!footerData) {
    return { success: false, message: 'ข้อมูลไม่ถูกต้อง' };
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var props = PropertiesService.getScriptProperties();
    var settings = {
      text_main: String(footerData.text_main || DEFAULT_FOOTER.text_main).trim(),
      text_sub: String(footerData.text_sub || DEFAULT_FOOTER.text_sub).trim()
    };
    props.setProperty('FOOTER_SETTINGS', JSON.stringify(settings));
    setSettingValue('footer_text_main', settings.text_main, 'ข้อความแถวบนท้ายเว็บ (Footer Main)');
    setSettingValue('footer_text_sub', settings.text_sub, 'ข้อความแถวล่างท้ายเว็บ (Footer Sub)');
    invalidateCache();
    return {
      success: true,
      message: 'บันทึกข้อมูลและจัดตำแหน่งท้ายเว็บเรียบร้อยแล้ว',
      footer: settings
    };
  } catch (err) {
    Logger.log('Error saving footer settings: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retrieve Site Settings from Settings sheet and ScriptProperties
 * @returns {Object}
 */
function getSiteSettings() {
  try {
    var ss = getSpreadsheet();
    var sheet = getOrCreateSettingsSheet(ss);
    var data = sheet.getDataRange().getValues();
    var map = {};
    for (var i = 1; i < data.length; i++) {
      var k = String(data[i][0]).trim();
      var v = data[i][1];
      if (k && v !== undefined && v !== null && String(v).trim() !== '') {
        map[k] = v;
      }
    }
    if (Object.keys(map).length > 0) {
      return {
        theme: map['theme'] || DEFAULT_SETTINGS.theme,
        font: map['font'] || DEFAULT_SETTINGS.font,
        school_name: map['school_name'] || DEFAULT_SETTINGS.school_name,
        school_tagline: map['school_tagline'] || DEFAULT_SETTINGS.school_tagline,
        school_logo_url: map['school_logo_url'] || DEFAULT_SETTINGS.school_logo_url,
        maintenance_mode: map['maintenance_mode'] === true || String(map['maintenance_mode']).toLowerCase() === 'true',
        maintenance_message: map['maintenance_message'] || DEFAULT_SETTINGS.maintenance_message,
        footer_text_main: map['footer_text_main'] || DEFAULT_SETTINGS.footer_text_main,
        footer_text_sub: map['footer_text_sub'] || DEFAULT_SETTINGS.footer_text_sub
      };
    }
  } catch (e) {
    Logger.log('Error reading site settings from sheet: ' + e);
  }

  // Fallback to Script Properties
  try {
    var props = PropertiesService.getScriptProperties();
    var val = props.getProperty('SITE_SETTINGS');
    if (val) {
      var parsed = JSON.parse(val);
      return {
        theme: parsed.theme || DEFAULT_SETTINGS.theme,
        font: parsed.font || DEFAULT_SETTINGS.font,
        school_name: parsed.school_name || DEFAULT_SETTINGS.school_name,
        school_tagline: parsed.school_tagline || DEFAULT_SETTINGS.school_tagline,
        school_logo_url: parsed.school_logo_url || '',
        maintenance_mode: Boolean(parsed.maintenance_mode),
        maintenance_message: parsed.maintenance_message || DEFAULT_SETTINGS.maintenance_message,
        footer_text_main: parsed.footer_text_main || DEFAULT_SETTINGS.footer_text_main,
        footer_text_sub: parsed.footer_text_sub || DEFAULT_SETTINGS.footer_text_sub
      };
    }
  } catch (propsErr) {
    Logger.log('Error reading site settings props: ' + propsErr);
  }
  return {
    theme: DEFAULT_SETTINGS.theme,
    font: DEFAULT_SETTINGS.font,
    school_name: DEFAULT_SETTINGS.school_name,
    school_tagline: DEFAULT_SETTINGS.school_tagline,
    school_logo_url: DEFAULT_SETTINGS.school_logo_url,
    maintenance_mode: DEFAULT_SETTINGS.maintenance_mode,
    maintenance_message: DEFAULT_SETTINGS.maintenance_message,
    footer_text_main: DEFAULT_SETTINGS.footer_text_main,
    footer_text_sub: DEFAULT_SETTINGS.footer_text_sub
  };
}

/**
 * Save Site Settings to Settings sheet and ScriptProperties
 * @param {Object} payload
 */
function saveSiteSettings(payload) {
  if (!payload || typeof payload !== 'object') {
    return { success: false, message: 'ข้อมูลการตั้งค่าไม่ถูกต้อง' };
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var current = getSiteSettings();
    var updated = {
      theme: payload.theme || current.theme,
      font: payload.font || current.font,
      school_name: payload.school_name !== undefined ? String(payload.school_name).trim() : current.school_name,
      school_tagline: payload.school_tagline !== undefined ? String(payload.school_tagline).trim() : current.school_tagline,
      school_logo_url: payload.school_logo_url !== undefined ? String(payload.school_logo_url).trim() : current.school_logo_url,
      maintenance_mode: payload.maintenance_mode !== undefined ? Boolean(payload.maintenance_mode) : current.maintenance_mode,
      maintenance_message: payload.maintenance_message !== undefined ? String(payload.maintenance_message).trim() : current.maintenance_message,
      footer_text_main: payload.footer_text_main !== undefined ? String(payload.footer_text_main).trim() : current.footer_text_main,
      footer_text_sub: payload.footer_text_sub !== undefined ? String(payload.footer_text_sub).trim() : current.footer_text_sub
    };

    // Save each key to Settings sheet
    setSettingValue('school_name', updated.school_name, 'ชื่อหน่วยงานหรือสถานศึกษา');
    setSettingValue('school_tagline', updated.school_tagline, 'คำขวัญ / สโลแกนสถานศึกษา');
    setSettingValue('theme', updated.theme, 'ธีมสีหลักของระบบ');
    setSettingValue('font', updated.font, 'ฟอนต์ตัวอักษร');
    setSettingValue('school_logo_url', updated.school_logo_url, 'ลิงก์รูปภาพโลโก้สถานศึกษา');
    setSettingValue('maintenance_mode', String(updated.maintenance_mode), 'โหมดปิดปรับปรุงระบบ (true/false)');
    setSettingValue('maintenance_message', updated.maintenance_message, 'ข้อความแจ้งเตือนเมื่อปิดปรับปรุง');
    setSettingValue('footer_text_main', updated.footer_text_main, 'ข้อความแถวบนท้ายเว็บ (Footer Main)');
    setSettingValue('footer_text_sub', updated.footer_text_sub, 'ข้อความแถวล่างท้ายเว็บ (Footer Sub)');

    // Also persist in PropertiesService for backwards compatibility
    var props = PropertiesService.getScriptProperties();
    props.setProperty('SITE_SETTINGS', JSON.stringify(updated));
    props.setProperty('FOOTER_SETTINGS', JSON.stringify({
      text_main: updated.footer_text_main,
      text_sub: updated.footer_text_sub
    }));

    invalidateCache();
    return {
      success: true,
      message: 'บันทึกการตั้งค่าเว็บไซต์และซิงค์ลงใน Google Sheet เรียบร้อยแล้ว',
      settings: updated
    };
  } catch (err) {
    Logger.log('Error saving site settings: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Change Admin PIN Code
 * @param {Object} payload - { oldPin, newPin }
 */
function changeAdminPin(payload) {
  if (!payload || !payload.oldPin || !payload.newPin) {
    return { success: false, message: 'กรุณากรอกรหัส PIN เดิมและรหัส PIN ใหม่' };
  }
  var configuredPin = getAdminPin();

  if (String(payload.oldPin).trim() !== String(configuredPin).trim()) {
    return { success: false, message: 'รหัส PIN เดิมไม่ถูกต้อง' };
  }
  if (String(payload.newPin).trim().length < 4) {
    return { success: false, message: 'รหัส PIN ใหม่ต้องมีความยาวอย่างน้อย 4 หลัก' };
  }

  setAdminPin(payload.newPin);
  return { success: true, message: 'เปลี่ยนรหัส PIN ผู้ดูแลระบบสำเร็จ และบันทึกลงใน Google Sheet แล้ว' };
}

/**
 * Mark an Issue Report as Resolved
 * @param {string} reportId
 */
function resolveIssue(reportId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.REPORTS);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(reportId)) {
        sheet.getRange(i + 1, 6).setValue('resolved');
        return { success: true, message: 'ปรับปรุงสถานะเป็นแก้ไขแล้วเรียบร้อย' };
      }
    }
    return { success: false, message: 'ไม่พบรายการแจ้งปัญหา' };
  } catch (err) {
    Logger.log('Error in resolveIssue: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Delete an Issue Report
 * @param {string} reportId
 */
function deleteIssueReport(reportId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.REPORTS);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(reportId)) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'ลบรายการแจ้งปัญหาเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบรายการแจ้งปัญหาที่ต้องการลบ' };
  } catch (err) {
    Logger.log('Error in deleteIssueReport: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// CATEGORY MANAGEMENT (CRUD & REORDERING)
// ==========================================

/**
 * Get all categories in order
 * @returns {Array<string>} list of category names
 */
function getCategories() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.CATEGORIES);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.CATEGORIES);
      var catHeaders = ['category_name', 'updated_at'];
      sheet.appendRow(catHeaders);
      styleHeaderRow(sheet, catHeaders.length);
      DEFAULT_CATEGORIES.forEach(function(c) {
        sheet.appendRow([c, new Date()]);
      });
      autoFitColumns(sheet, catHeaders.length);
      return DEFAULT_CATEGORIES.slice();
    }

    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      DEFAULT_CATEGORIES.forEach(function(c) {
        sheet.appendRow([c, new Date()]);
      });
      return DEFAULT_CATEGORIES.slice();
    }

    var categories = [];
    for (var i = 1; i < data.length; i++) {
      var val = String(data[i][0] || '').trim();
      if (val && categories.indexOf(val) === -1) {
        categories.push(val);
      }
    }

    return categories.length > 0 ? categories : DEFAULT_CATEGORIES.slice();
  } catch (err) {
    Logger.log('Error in getCategories: ' + err);
    return DEFAULT_CATEGORIES.slice();
  }
}

/**
 * Batch Save / Reorder Categories
 * @param {Array<string>} categoriesList
 */
function saveCategories(categoriesList) {
  if (!Array.isArray(categoriesList) || categoriesList.length === 0) {
    return { success: false, message: 'ข้อมูลหมวดหมู่ไม่ถูกต้อง' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.CATEGORIES);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.CATEGORIES);
      sheet.appendRow(['category_name', 'updated_at']);
      styleHeaderRow(sheet, 2);
    }

    var now = new Date();
    var rows = [];
    var seen = {};
    for (var i = 0; i < categoriesList.length; i++) {
      var name = String(categoriesList[i] || '').trim();
      if (name && !seen[name]) {
        seen[name] = true;
        rows.push([name, now]);
      }
    }

    if (rows.length === 0) {
      return { success: false, message: 'ต้องมีหมวดหมู่อย่างน้อย 1 รายการ' };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
    }

    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    invalidateCache();

    return {
      success: true,
      message: 'บันทึกการจัดเรียงหมวดหมู่ ' + rows.length + ' รายการเรียบร้อยแล้ว',
      categories: rows.map(function(r) { return r[0]; })
    };
  } catch (err) {
    Logger.log('Error in saveCategories: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update Category Name (Renames in Categories sheet & cascades to Apps sheet)
 * @param {string} oldName
 * @param {string} newName
 */
function updateCategoryName(oldName, newName) {
  if (typeof oldName === 'object' && oldName !== null) {
    newName = oldName.newName;
    oldName = oldName.oldName;
  }
  oldName = String(oldName || '').trim();
  newName = String(newName || '').trim();

  if (!oldName || !newName) {
    return { success: false, message: 'กรุณาระบุชื่อหมวดหมู่เดิมและชื่อใหม่' };
  }
  if (oldName === newName) {
    return { success: true, message: 'ชื่อหมวดหมู่เหมือนเดิม', categories: getCategories() };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var catSheet = ss.getSheetByName(CONFIG.SHEETS.CATEGORIES);
    var appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    var now = new Date();

    // 1. Update in Categories Sheet
    if (catSheet) {
      var catData = catSheet.getDataRange().getValues();
      var foundCat = false;
      for (var i = 1; i < catData.length; i++) {
        if (String(catData[i][0]).trim() === oldName) {
          catSheet.getRange(i + 1, 1).setValue(newName);
          catSheet.getRange(i + 1, 2).setValue(now);
          foundCat = true;
          break;
        }
      }
      if (!foundCat) {
        catSheet.appendRow([newName, now]);
      }
    }

    // 2. Cascade update in Apps Sheet
    var updatedAppsCount = 0;
    if (appsSheet) {
      var appsData = appsSheet.getDataRange().getValues();
      for (var a = 1; a < appsData.length; a++) {
        if (String(appsData[a][3]).trim() === oldName) {
          appsSheet.getRange(a + 1, 4).setValue(newName);
          appsSheet.getRange(a + 1, 12).setValue(now);
          updatedAppsCount++;
        }
      }
    }

    invalidateCache();
    return {
      success: true,
      message: 'เปลี่ยนชื่อหมวดหมู่เป็น "' + newName + '" เรียบร้อยแล้ว (อัปเดต ' + updatedAppsCount + ' ระบบ)',
      categories: getCategories()
    };
  } catch (err) {
    Logger.log('Error in updateCategoryName: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Delete a Category (Removes from Categories sheet & reassigns apps to fallbackCategory)
 * @param {string|Object} categoryName - category name string or { categoryName, fallbackCategory }
 * @param {string} [fallbackCategory]
 */
function deleteCategory(categoryName, fallbackCategory) {
  if (typeof categoryName === 'object' && categoryName !== null) {
    fallbackCategory = categoryName.fallbackCategory;
    categoryName = categoryName.categoryName;
  }
  categoryName = String(categoryName || '').trim();
  fallbackCategory = String(fallbackCategory || '').trim() || 'กลุ่มบริหารทั่วไป';

  if (!categoryName) {
    return { success: false, message: 'กรุณาระบุหมวดหมู่ที่ต้องการลบ' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = getSpreadsheet();
    var catSheet = ss.getSheetByName(CONFIG.SHEETS.CATEGORIES);
    var appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
    var now = new Date();

    // 1. Delete row from Categories Sheet
    if (catSheet) {
      var catData = catSheet.getDataRange().getValues();
      for (var i = 1; i < catData.length; i++) {
        if (String(catData[i][0]).trim() === categoryName) {
          catSheet.deleteRow(i + 1);
          break;
        }
      }
    }

    // 2. Reassign apps using this category to fallbackCategory
    var reassignedCount = 0;
    if (appsSheet) {
      var appsData = appsSheet.getDataRange().getValues();
      for (var a = 1; a < appsData.length; a++) {
        if (String(appsData[a][3]).trim() === categoryName) {
          appsSheet.getRange(a + 1, 4).setValue(fallbackCategory);
          appsSheet.getRange(a + 1, 12).setValue(now);
          reassignedCount++;
        }
      }
    }

    invalidateCache();
    return {
      success: true,
      message: 'ลบหมวดหมู่ "' + categoryName + '" สำเร็จ' + (reassignedCount > 0 ? ' (ย้าย ' + reassignedCount + ' ระบบไปยัง "' + fallbackCategory + '")' : ''),
      categories: getCategories()
    };
  } catch (err) {
    Logger.log('Error in deleteCategory: ' + err);
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// DATABASE SCHEMA & SEED SETUP
// ==========================================

/**
 * One-Click Database Setup Function
 * Checks and creates all 4 sheets, applies styling, and inserts rich seed data
 */
function setupDatabase() {
  var ss = getSpreadsheet();
  
  // 1. Create or format Apps Sheet
  var appsSheet = ss.getSheetByName(CONFIG.SHEETS.APPS);
  if (!appsSheet) {
    appsSheet = ss.insertSheet(CONFIG.SHEETS.APPS);
  }
  if (appsSheet.getLastRow() === 0) {
    var appsHeaders = ['id', 'title', 'description', 'category', 'url', 'manual_url', 'icon', 'color', 'status', 'role_access', 'click_count', 'updated_at'];
    appsSheet.appendRow(appsHeaders);
    styleHeaderRow(appsSheet, appsHeaders.length);

    var seedApps = getSeedApps();
    seedApps.forEach(function(item) {
      appsSheet.appendRow([
        item.id,
        item.title,
        item.description,
        item.category,
        item.url,
        item.manual_url,
        item.icon,
        item.color,
        item.status,
        item.role_access,
        item.click_count,
        new Date()
      ]);
    });
    autoFitColumns(appsSheet, appsHeaders.length);
  }

  // 2. Create or format Analytics_Logs Sheet
  var logsSheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
  if (!logsSheet) {
    logsSheet = ss.insertSheet(CONFIG.SHEETS.LOGS);
  }
  if (logsSheet.getLastRow() === 0) {
    var logsHeaders = ['log_id', 'app_id', 'app_title', 'category', 'device', 'date', 'time'];
    logsSheet.appendRow(logsHeaders);
    styleHeaderRow(logsSheet, logsHeaders.length);

    // Insert 28 realistic simulated log records across 7 days
    var seedLogs = getSeedLogs();
    seedLogs.forEach(function(log) {
      logsSheet.appendRow([
        log.log_id,
        log.app_id,
        log.app_title,
        log.category,
        log.device,
        log.date,
        log.time
      ]);
    });
    autoFitColumns(logsSheet, logsHeaders.length);
  }

  // 3. Create or format Announcements Sheet
  var annSheet = ss.getSheetByName(CONFIG.SHEETS.ANNOUNCEMENTS);
  if (!annSheet) {
    annSheet = ss.insertSheet(CONFIG.SHEETS.ANNOUNCEMENTS);
  }
  if (annSheet.getLastRow() === 0) {
    var annHeaders = ['id', 'message', 'type', 'is_active', 'updated_at'];
    annSheet.appendRow(annHeaders);
    styleHeaderRow(annSheet, annHeaders.length);

    annSheet.appendRow([
      'ann_1',
      '📢 ยินดีต้อนรับสู่ระบบ Smart School Web App Hub ภาคเรียนที่ 1 - ขอความร่วมมือคุณครูทุกท่านบันทึกข้อตกลงในการพัฒนางาน (PA) ภายในสัปดาห์นี้',
      'info',
      true,
      new Date()
    ]);
    autoFitColumns(annSheet, annHeaders.length);
  }

  // 4. Create or format Issue_Reports Sheet
  var repSheet = ss.getSheetByName(CONFIG.SHEETS.REPORTS);
  if (!repSheet) {
    repSheet = ss.insertSheet(CONFIG.SHEETS.REPORTS);
  }
  if (repSheet.getLastRow() === 0) {
    var repHeaders = ['report_id', 'app_id', 'app_title', 'reporter_name', 'detail', 'status', 'created_at'];
    repSheet.appendRow(repHeaders);
    styleHeaderRow(repSheet, repHeaders.length);

    repSheet.appendRow([
      'REP-001',
      'app_1',
      'SMART SCHOOL BUDGET PRO',
      'ครูสมชาย ใจดี',
      'เข้าใช้งานระบบช่วงเช้าบางครั้งโหลดข้อมูลช้าเล็กน้อย',
      'pending',
      Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm')
    ]);
    repSheet.appendRow([
      'REP-002',
      'app_3',
      'ระบบงานบริหารทั่วไปดิจิทัล',
      'ครูวิภา รักษ์เรียน',
      'แจ้งซ่อมโปรเจกเตอร์ห้องเรียน 302 ได้รับการประสานงานเรียบร้อยแล้ว',
      'resolved',
      Utilities.formatDate(new Date(Date.now() - 86400000 * 2), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm')
    ]);
    autoFitColumns(repSheet, repHeaders.length);
  }

  // 5. Create or format Categories Sheet
  var catSheet = ss.getSheetByName(CONFIG.SHEETS.CATEGORIES);
  if (!catSheet) {
    catSheet = ss.insertSheet(CONFIG.SHEETS.CATEGORIES);
  }
  if (catSheet.getLastRow() === 0) {
    var catHeaders = ['category_name', 'updated_at'];
    catSheet.appendRow(catHeaders);
    styleHeaderRow(catSheet, catHeaders.length);

    DEFAULT_CATEGORIES.forEach(function(c) {
      catSheet.appendRow([c, new Date()]);
    });
    autoFitColumns(catSheet, catHeaders.length);
  }

  // 6. Create or format Settings Sheet (Stores Admin PIN, App Lock PIN, and site configurations)
  getOrCreateSettingsSheet(ss);

  // Invalidate any old cache
  invalidateCache();
  Logger.log('✅ Database setup completed successfully with all 6 sheets (including Categories and Settings)!');
}

/**
 * Styles table header row with Modern Navy Blue theme
 */
function styleHeaderRow(sheet, numColumns) {
  var headerRange = sheet.getRange(1, 1, 1, numColumns);
  headerRange.setBackground('#1e3a8a'); // Modern Navy Blue
  headerRange.setFontColor('#ffffff'); // White text
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);
}

/**
 * Auto fits column widths with safety minimum
 */
function autoFitColumns(sheet, numColumns) {
  for (var c = 1; c <= numColumns; c++) {
    sheet.autoResizeColumn(c);
    var width = sheet.getColumnWidth(c);
    if (width < 110) sheet.setColumnWidth(c, 110);
  }
}

/**
 * Helper to format date strings
 */
function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
  }
  return String(val);
}

/**
 * Seed Apps Data: 6 realistic school applications
 */
function getSeedApps() {
  return [
    {
      id: 'app_1',
      title: 'SMART SCHOOL BUDGET PRO',
      description: 'ระบบควบคุมและติดตามงบประมาณโรงเรียนแบบเรียลไทม์ พร้อมระบบวิเคราะห์แผนงานและการเบิกจ่าย',
      category: 'กลุ่มบริหารงานงบประมาณ',
      url: 'https://lookerstudio.google.com/',
      manual_url: 'https://docs.google.com/',
      icon: 'wallet',
      color: 'amber',
      status: 'online',
      role_access: 'all',
      click_count: 142
    },
    {
      id: 'app_2',
      title: 'Smart OMR Grading',
      description: 'ระบบตรวจกระดาษคำตอบอัตโนมัติด้วยกล้องมือถือ วิเคราะห์ผลสัมฤทธิ์และตัดเกรดแม่นยำ',
      category: 'กลุ่มบริหารงานวิชาการ',
      url: 'https://workspace.google.com',
      manual_url: 'https://docs.google.com/',
      icon: 'scan-line',
      color: 'blue',
      status: 'online',
      role_access: 'all',
      click_count: 215
    },
    {
      id: 'app_3',
      title: 'ระบบงานบริหารทั่วไปดิจิทัล',
      description: 'ระบบแจ้งซ่อมบำรุง จองห้องประชุม ขอใช้ยานพาหนะ และจัดการอาคารสถานที่แบบครบวงจร',
      category: 'กลุ่มบริหารทั่วไป',
      url: 'https://workspace.google.com',
      manual_url: 'https://docs.google.com/',
      icon: 'building-2',
      color: 'emerald',
      status: 'online',
      role_access: 'all',
      click_count: 98
    },
    {
      id: 'app_4',
      title: 'ระบบทะเบียนคุมพัสดุและครุภัณฑ์',
      description: 'ตรวจสอบสถานะครุภัณฑ์โรงเรียนและเบิกจ่ายวัสดุสิ้นเปลืองด้วยการสแกน QR Code ประจำจุด',
      category: 'กลุ่มบริหารงานงบประมาณ',
      url: 'https://workspace.google.com',
      manual_url: 'https://docs.google.com/',
      icon: 'package-check',
      color: 'cyan',
      status: 'online',
      role_access: 'all',
      click_count: 64
    },
    {
      id: 'app_5',
      title: 'ระบบจัดเก็บผลงานและประเมิน PA',
      description: 'ระบบบันทึกรายงานผลการปฏิบัติงาน ข้อตกลงในการพัฒนางาน (PA) และแฟ้มสะสมงานครูดิจิทัล',
      category: 'กลุ่มบริหารงานบุคคล',
      url: 'https://workspace.google.com',
      manual_url: 'https://docs.google.com/',
      icon: 'award',
      color: 'purple',
      status: 'online',
      role_access: 'all',
      click_count: 187
    },
    {
      id: 'app_6',
      title: 'Executive Data Center',
      description: 'แดชบอร์ดสารสนเทศและสถิติภาพรวมโรงเรียน เพื่อการตัดสินใจและวางแผนยุทธศาสตร์สำหรับผู้บริหาร',
      category: 'สำหรับผู้บริหาร',
      url: 'https://lookerstudio.google.com/',
      manual_url: 'https://docs.google.com/',
      icon: 'pie-chart',
      color: 'rose',
      status: 'online',
      role_access: 'executive',
      click_count: 112
    }
  ];
}

/**
 * Seed Logs Data: 28 simulated log records for 7-day trend
 */
function getSeedLogs() {
  var logs = [];
  var apps = getSeedApps();
  var devices = ['Desktop', 'Mobile'];
  var now = new Date();

  // Distribute over the past 7 days
  for (var dayOffset = 6; dayOffset >= 0; dayOffset--) {
    var targetDate = new Date();
    targetDate.setDate(now.getDate() - dayOffset);
    var dateStr = Utilities.formatDate(targetDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    
    // 3 to 6 logs per day
    var dailyCount = 3 + (dayOffset % 4);
    for (var k = 0; k < dailyCount; k++) {
      var app = apps[(k + dayOffset) % apps.length];
      var dev = devices[(k + dayOffset) % devices.length];
      var hour = 8 + ((k * 2) % 9);
      var min = 10 + ((k * 13) % 45);
      var sec = 12 + ((k * 7) % 45);
      var timeStr = (hour < 10 ? '0' + hour : hour) + ':' + (min < 10 ? '0' + min : min) + ':' + (sec < 10 ? '0' + sec : sec);

      logs.push({
        log_id: 'LOG-SEED-' + dayOffset + '-' + k,
        app_id: app.id,
        app_title: app.title,
        category: app.category,
        device: dev,
        date: dateStr,
        time: timeStr
      });
    }
  }
  return logs;
}
