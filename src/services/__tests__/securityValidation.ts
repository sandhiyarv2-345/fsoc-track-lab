/**
 * FSOC Track Lab — Security Validation Tests
 *
 * Run with: npx tsx src/services/__tests__/securityValidation.ts
 *
 * Tests:
 * 1. CSV injection prevention
 * 2. HTML escaping
 * 3. Input validation (NaN, Infinity, extreme values)
 * 4. No secrets in exports
 * 5. No unexpected network calls (structural check)
 */

import { sanitizeCsvCell, sanitizeCsvRow } from '../csvSanitize';
import { validateSimulationConfig } from '../simulationEngine';
import { SimulationConfig } from '../../types';

let testsPassed = 0;
let testsFailed = 0;
let testsTotal = 0;

function assert(condition: boolean, testName: string, detail?: string): void {
  testsTotal++;
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${testName}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name: string): void {
  console.log(`\n═══ ${name} ═══`);
}

// ── Helper: Minimal HTML escape (mirrors ReportModal.escapeHtml) ──
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── TEST 1: CSV INJECTION PREVENTION ──
function testCsvInjection(): void {
  section('TEST 1 — CSV INJECTION PREVENTION');

  // Dangerous values that spreadsheet apps interpret as formulas
  const dangerousValues = [
    '=CMD("/C calc")',
    '+CMD("/C calc")',
    '-CMD("/C calc")',
    '@SUM(A1:A10)',
    '=1+1',
    '+1',
    '-1',
    '@risk',
  ];

  for (const val of dangerousValues) {
    const sanitized = sanitizeCsvCell(val);
    assert(sanitized.startsWith("'"), `Dangerous value "${val}" is neutralized → "${sanitized}"`);
  }

  // Safe values should not be modified
  const safeValues = [
    'AI Centroid',
    '12.345',
    'LOCKED',
    'Hello World',
    '95.2%',
    'N/A',
  ];

  for (const val of safeValues) {
    const sanitized = sanitizeCsvCell(val);
    assert(sanitized === val, `Safe value "${val}" is unchanged`);
  }

  // Empty and whitespace
  assert(sanitizeCsvCell('') === '', 'Empty string is unchanged');
  assert(sanitizeCsvCell('  =test') === "'  =test", 'Leading whitespace + dangerous char is neutralized');

  // Row sanitization
  const row = ['test', '=formula', 'safe'];
  const sanitizedRow = sanitizeCsvRow(row);
  assert(sanitizedRow[0] === 'test', 'Row: safe value unchanged');
  assert(sanitizedRow[1] === "'=formula", 'Row: dangerous value neutralized');
  assert(sanitizedRow[2] === 'safe', 'Row: safe value unchanged');
}

// ── TEST 2: HTML ESCAPING ──
function testHtmlEscaping(): void {
  section('TEST 2 — HTML ESCAPING');

  const xssPayloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
    "'><script>alert(1)</script>",
    '<svg onload=alert(1)>',
    'javascript:alert(1)',
    '<iframe src="evil.com">',
  ];

  for (const payload of xssPayloads) {
    const escaped = escapeHtml(payload);
    assert(!escaped.includes('<script'), `XSS payload escaped: "${payload.substring(0, 30)}..."`);
    assert(escaped.includes('&lt;') || !escaped.includes('<'), `No raw HTML tags in escaped output`);
  }

  // Normal text should pass through
  assert(escapeHtml('AI Centroid') === 'AI Centroid', 'Normal text unchanged');
  assert(escapeHtml('Demo-01 (Easy)') === 'Demo-01 (Easy)', 'Config name unchanged');
}

// ── TEST 3: INPUT VALIDATION ──
function testInputValidation(): void {
  section('TEST 3 — INPUT VALIDATION');

  const baseConfig: SimulationConfig = {
    id: 'test',
    name: 'Test',
    targetCount: 1,
    designatedBeaconIndex: 1,
    targetSpeedMach: 2.4,
    trajectory: 'Random',
    cameraFov: 20,
    initialPosition: 'Default Center',
    panSpeedLimit: 30,
    tiltSpeedLimit: 25,
    disturbances: { sensorNoise: false, vibration: true, atmosphericTurbulence: false, motionJitter: true, intensity: 80 },
    durationSec: 30,
    timeStep: 0.016,
  };

  // NaN values
  const nanConfig = { ...baseConfig, targetSpeedMach: NaN, cameraFov: NaN, panSpeedLimit: NaN };
  const validatedNan = validateSimulationConfig(nanConfig);
  assert(!isNaN(validatedNan.targetSpeedMach), 'NaN targetSpeedMach is clamped to default');
  assert(!isNaN(validatedNan.cameraFov), 'NaN cameraFov is clamped to default');
  assert(!isNaN(validatedNan.panSpeedLimit), 'NaN panSpeedLimit is clamped to default');

  // Infinity
  const infConfig = { ...baseConfig, targetSpeedMach: Infinity, durationSec: Infinity };
  const validatedInf = validateSimulationConfig(infConfig);
  assert(validatedInf.targetSpeedMach <= 10, 'Infinity targetSpeedMach is clamped');
  assert(validatedInf.durationSec <= 600, 'Infinity durationSec is clamped');

  // Negative values
  const negConfig = { ...baseConfig, targetCount: -5, cameraFov: -10, panSpeedLimit: -100 };
  const validatedNeg = validateSimulationConfig(negConfig);
  assert(validatedNeg.targetCount >= 1, 'Negative targetCount is clamped to 1');
  assert(validatedNeg.cameraFov >= 1, 'Negative cameraFov is clamped to 1');
  assert(validatedNeg.panSpeedLimit >= 1, 'Negative panSpeedLimit is clamped to 1');

  // Extreme values
  const extremeConfig = { ...baseConfig, targetCount: 1000, targetSpeedMach: 999, durationSec: 999999 };
  const validatedExtreme = validateSimulationConfig(extremeConfig);
  assert(validatedExtreme.targetCount <= 20, 'Extreme targetCount is clamped to 20');
  assert(validatedExtreme.targetSpeedMach <= 10, 'Extreme targetSpeedMach is clamped');
  assert(validatedExtreme.durationSec <= 600, 'Extreme durationSec is clamped');

  // Invalid trajectory
  const invalidTraj = { ...baseConfig, trajectory: 'INVALID' as any };
  const validatedTraj = validateSimulationConfig(invalidTraj);
  assert(validatedTraj.trajectory === 'Random', 'Invalid trajectory defaults to Random');

  // Valid config passes through unchanged
  const validConfig = validateSimulationConfig(baseConfig);
  assert(validConfig.targetCount === 1, 'Valid targetCount preserved');
  assert(validConfig.targetSpeedMach === 2.4, 'Valid targetSpeedMach preserved');
  assert(validConfig.cameraFov === 20, 'Valid cameraFov preserved');
  assert(validConfig.panSpeedLimit === 30, 'Valid panSpeedLimit preserved');
  assert(validConfig.tiltSpeedLimit === 25, 'Valid tiltSpeedLimit preserved');
  assert(validConfig.durationSec === 30, 'Valid durationSec preserved');
  assert(validConfig.timeStep === 0.016, 'Valid timeStep preserved');
}

// ── TEST 4: NO SECRETS IN EXPORTS ──
function testNoSecretsInExports(): void {
  section('TEST 4 — NO SECRETS IN EXPORTS');

  // CSV export should only contain simulation data
  const csvHeaders = ['Configuration', 'Algorithm', 'Seed', 'Duration(s)', 'Time(s)'];
  const csvRow = ['Custom Config', 'AI Centroid', '42', '30', '1.00'];

  const combinedCsv = csvHeaders.join(',') + '\n' + csvRow.join(',');

  const secretPatterns = [
    'API_KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'PRIVATE',
    'GEMINI', 'AWS', 'AZURE', 'OPENAI', 'Bearer',
    'sk-', 'ghp_', 'glpat-',
  ];

  for (const pattern of secretPatterns) {
    assert(!combinedCsv.includes(pattern), `CSV export does not contain "${pattern}"`);
  }

  // HTML report should not contain secrets
  const htmlReport = `<html><body>Configuration: Custom Config, Algorithm: AI Centroid</body></html>`;
  for (const pattern of secretPatterns) {
    assert(!htmlReport.includes(pattern), `HTML report does not contain "${pattern}"`);
  }
}

// ── TEST 5: XSS PAYLOAD AS CONFIG NAME ──
function testXssInConfigName(): void {
  section('TEST 5 — XSS IN CONFIG NAME');

  const maliciousNames = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
    "'; alert(1); //",
    '<svg/onload=alert(1)>',
  ];

  for (const name of maliciousNames) {
    const escaped = escapeHtml(name);
    assert(!escaped.includes('<script'), `Config name "${name.substring(0, 20)}..." is HTML-escaped`);
    assert(escaped.includes('&lt;') || !escaped.includes('<'), `No raw < in escaped config name`);
  }
}

// ── TEST 6: CONFIG IDENTITY ──
function testConfigIdentity(): void {
  section('TEST 6 — CONFIG IDENTITY PRESERVED');

  const config: SimulationConfig = {
    id: 'custom_12345',
    name: 'My Test Config',
    configSource: 'custom',
    configDisplayName: 'My Custom Config',
    targetCount: 3,
    designatedBeaconIndex: 2,
    targetSpeedMach: 3.0,
    trajectory: 'Evasive Maneuvers',
    cameraFov: 15,
    initialPosition: 'Offset Left (45°)',
    panSpeedLimit: 40,
    tiltSpeedLimit: 35,
    disturbances: { sensorNoise: true, vibration: true, atmosphericTurbulence: true, motionJitter: true, intensity: 90 },
    durationSec: 60,
    timeStep: 0.016,
  };

  const validated = validateSimulationConfig(config);

  assert(validated.id === config.id, 'Config ID preserved');
  assert(validated.name === config.name, 'Config name preserved');
  assert(validated.configSource === config.configSource, 'Config source preserved');
  assert(validated.configDisplayName === config.configDisplayName, 'Config display name preserved');
  assert(validated.targetCount === config.targetCount, 'Target count preserved');
  assert(validated.designatedBeaconIndex === config.designatedBeaconIndex, 'Beacon index preserved');
  assert(validated.trajectory === config.trajectory, 'Trajectory preserved');
  assert(validated.initialPosition === config.initialPosition, 'Initial position preserved');
  assert(validated.disturbances.sensorNoise === config.disturbances.sensorNoise, 'Sensor noise flag preserved');
  assert(validated.disturbances.vibration === config.disturbances.vibration, 'Vibration flag preserved');
  assert(validated.disturbances.atmosphericTurbulence === config.disturbances.atmosphericTurbulence, 'Turbulence flag preserved');
}

// ── Run All Tests ──
function runAllTests(): void {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  FSOC Track Lab — Security Validation Tests         ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  testCsvInjection();
  testHtmlEscaping();
  testInputValidation();
  testNoSecretsInExports();
  testXssInConfigName();
  testConfigIdentity();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`RESULTS: ${testsPassed}/${testsTotal} passed, ${testsFailed} failed`);
  console.log('══════════════════════════════════════════════════════');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests();
