import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import com.catalyst.advanced.CatalystAdvancedIOHandler;
import com.zc.component.object.ZCObject;
import com.zc.component.object.ZCRowObject;
import com.zc.component.object.ZCTable;
import com.zc.component.zcql.ZCQL;

public class Sample implements CatalystAdvancedIOHandler {
	private static final Logger LOGGER = Logger.getLogger(Sample.class.getName());

	// JWT expiry: 24 hours in seconds
	private static final long JWT_EXPIRY_SECONDS = 24 * 60 * 60;

	@Override
	public void runner(HttpServletRequest request, HttpServletResponse response) throws Exception {
		handleLocalCors(request, response);

		String method = request.getMethod().toUpperCase();

		// Always handle CORS preflight
		if ("OPTIONS".equalsIgnoreCase(method)) {
			response.setStatus(204);
			return;
		}

		String uri = request.getRequestURI();
		if (uri == null) uri = "";

		// Extract the last path segment for strict route matching.
		// e.g. "/server/chopper_api/execute/auth?foo=bar" -> "auth"
		String path = extractPath(uri);

		LOGGER.log(Level.INFO, "Request Received: Method=" + method + ", URI=" + uri + ", path=" + path);

		try {
			// ── /auth is the only public endpoint ──────────────────────────────────
			if ("auth".equals(path)) {
				if ("POST".equals(method)) {
					handleAuth(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
				return;
			}

			// ── All other endpoints require a valid JWT ─────────────────────────────
			if (!isValidJwt(request)) {
				sendJson(response, 401, new JSONObject().put("error", "Unauthorized: missing or invalid token"));
				return;
			}

			// ── Route dispatch ──────────────────────────────────────────────────────
			if ("entries".equals(path)) {
				if ("GET".equals(method)) {
					handleGetEntries(request, response);
				} else if ("POST".equals(method) || "PUT".equals(method)) {
					handleSaveEntry(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteEntry(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("reactions".equals(path)) {
				if ("GET".equals(method)) {
					handleGetReactions(request, response);
				} else if ("POST".equals(method) || "PUT".equals(method)) {
					handleSaveReaction(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteReaction(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("triggers".equals(path)) {
				if ("GET".equals(method)) {
					handleGetTriggers(request, response);
				} else if ("POST".equals(method)) {
					handlePostTrigger(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteTrigger(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("suspected-triggers".equals(path)) {
				if ("GET".equals(method)) {
					handleGetSuspectedTriggers(request, response);
				} else if ("POST".equals(method)) {
					handlePostSuspectedTrigger(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteSuspectedTrigger(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("heatmap".equals(path)) {
				if ("GET".equals(method)) {
					handleGetHeatmap(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("day-details".equals(path)) {
				if ("GET".equals(method)) {
					handleGetDayDetails(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("dashboard".equals(path) || path.isEmpty()) {
				if ("GET".equals(method)) {
					if (request.getParameter("month") != null) {
						handleGetHeatmap(request, response);
					} else if (request.getParameter("date") != null) {
						handleGetDayDetails(request, response);
					} else {
						handleGetDashboard(request, response);
					}
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else {
				sendJson(response, 404, new JSONObject().put("error", "Endpoint not found: " + uri));
			}
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, "Error handling request", e);
			sendJson(response, 500, new JSONObject().put("error", e.getMessage() != null ? e.getMessage() : "Internal server error"));
		}
	}

	// ── Auth Endpoint ─────────────────────────────────────────────────────────────

	private void handleAuth(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String passphrase = body.optString("passphrase", "").trim();

		if (passphrase.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "passphrase is required"));
			return;
		}

		String storedPassphrase = getEnv("CHOPPER_PASSPHRASE",null);
		if (storedPassphrase == null || storedPassphrase.isEmpty()) {
			LOGGER.log(Level.SEVERE, "CHOPPER_PASSPHRASE env variable is not set");
			sendJson(response, 500, new JSONObject().put("error", "Server configuration error"));
			return;
		}

		if (!passphrase.equals(storedPassphrase.trim())) {
			sendJson(response, 401, new JSONObject().put("error", "Invalid passphrase"));
			return;
		}

		// Issue JWT
		String jwtSecret = getEnv("CHOPPER_JWT_SECRET",null);
		if (jwtSecret == null || jwtSecret.isEmpty()) {
			LOGGER.log(Level.SEVERE, "CHOPPER_JWT_SECRET env variable is not set");
			sendJson(response, 500, new JSONObject().put("error", "Server configuration error"));
			return;
		}

		String token = signJwt(jwtSecret);
		JSONObject res = new JSONObject();
		res.put("token", token);
		res.put("expiresIn", JWT_EXPIRY_SECONDS);
		sendJson(response, 200, res);
	}

	// ── JWT Helpers ───────────────────────────────────────────────────────────────

	/**
	 * Signs an HS256 JWT with the given secret.
	 * Payload: { "sub": "chopper-admin", "iat": <now>, "exp": <now + 24h> }
	 */
	private String signJwt(String secret) throws Exception {
		long now = System.currentTimeMillis() / 1000L;
		long exp = now + JWT_EXPIRY_SECONDS;

		String header = base64UrlEncode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
		String payload = base64UrlEncode("{\"sub\":\"chopper-admin\",\"iat\":" + now + ",\"exp\":" + exp + "}");

		String signingInput = header + "." + payload;
		String signature = hmacSha256(signingInput, secret);

		return signingInput + "." + signature;
	}

	/**
	 * Validates the JWT from the X-Chopper-Token header.
	 * Returns true if the token is valid and not expired.
	 */
	private boolean isValidJwt(HttpServletRequest request) {
		String token = request.getHeader("X-Chopper-Token");
		if (token == null || token.trim().isEmpty()) {
			return false;
		}
		token = token.trim();

		String jwtSecret = getEnv("CHOPPER_JWT_SECRET",null);
		if (jwtSecret == null || jwtSecret.isEmpty()) {
			LOGGER.log(Level.SEVERE, "CHOPPER_JWT_SECRET env variable is not set");
			return false;
		}

		try {
			String[] parts = token.split("\\.");
			if (parts.length != 3) return false;

			// Verify signature
			String signingInput = parts[0] + "." + parts[1];
			String expectedSig = hmacSha256(signingInput, jwtSecret);
			if (!expectedSig.equals(parts[2])) {
				LOGGER.log(Level.WARNING, "JWT signature mismatch");
				return false;
			}

			// Verify expiry
			String payloadJson = new String(Base64.getUrlDecoder().decode(padBase64(parts[1])), StandardCharsets.UTF_8);
			JSONObject payloadObj = new JSONObject(payloadJson);
			long exp = payloadObj.optLong("exp", 0);
			long now = System.currentTimeMillis() / 1000L;

			if (exp == 0 || now > exp) {
				LOGGER.log(Level.WARNING, "JWT expired");
				return false;
			}

			return true;
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "JWT validation error: " + e.getMessage());
			return false;
		}
	}

	private String hmacSha256(String data, String secret) throws Exception {
		Mac mac = Mac.getInstance("HmacSHA256");
		SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		mac.init(keySpec);
		byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
	}

	private String base64UrlEncode(String input) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(input.getBytes(StandardCharsets.UTF_8));
	}

	private String padBase64(String base64url) {
		int pad = base64url.length() % 4;
		if (pad == 2) return base64url + "==";
		if (pad == 3) return base64url + "=";
		return base64url;
	}

	// ── Data Handlers ─────────────────────────────────────────────────────────────

	private String formatDateTime(String dt) {
		if (dt == null || dt.trim().isEmpty()) return "";
		String clean = dt.trim().replace("T", " ");
		if (clean.length() >= 19) {
			clean = clean.substring(0, 19);
		} else if (clean.length() == 16) {
			clean += ":00";
		} else if (clean.length() == 10) {
			clean += " 00:00:00";
		}
		return clean;
	}

	private boolean isFutureDateTime(String dtStr) {
		if (dtStr == null || dtStr.trim().isEmpty()) return false;
		try {
			String clean = dtStr.trim().replace("T", " ");
			String datePart = clean.split(" ")[0];
			LocalDate today = LocalDate.now();
			LocalDate targetDate = LocalDate.parse(datePart);
			return targetDate.isAfter(today);
		} catch (Exception e) {
			return false;
		}
	}

	private void handleGetEntries(HttpServletRequest request, HttpServletResponse response) throws Exception {
		ArrayList<ZCRowObject> rows = ZCQL.getInstance().executeQuery("SELECT ROWID, EntryType, ItemName, LoggedAt, Notes, CREATEDTIME FROM LogEntries ORDER BY LoggedAt DESC");
		JSONArray jsonArray = new JSONArray();
		for (ZCRowObject row : rows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "LogEntries", "ROWID"));
			item.put("entryType", getVal(row, "LogEntries", "EntryType"));
			item.put("itemName", getVal(row, "LogEntries", "ItemName"));
			item.put("loggedAt", getVal(row, "LogEntries", "LoggedAt"));
			item.put("notes", getVal(row, "LogEntries", "Notes"));
			item.put("createdAt", getVal(row, "LogEntries", "CREATEDTIME"));
			jsonArray.put(item);
		}
		sendJson(response, 200, new JSONObject().put("entries", jsonArray));
	}

	private void handleSaveEntry(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String idStr = body.optString("id", request.getParameter("id"));
		String entryType = body.optString("entryType", "food");
		String itemName = body.optString("itemName", "").trim();
		String loggedAt = formatDateTime(body.optString("loggedAt", ""));
		String notes = body.optString("notes", "");

		if (itemName.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "itemName is required"));
			return;
		}

		if (loggedAt.isEmpty()) {
			loggedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
		}

		if (isFutureDateTime(loggedAt)) {
			sendJson(response, 400, new JSONObject().put("error", "Cannot add or update log entries for future dates"));
			return;
		}

		ZCTable table = ZCObject.getInstance().getTable("LogEntries");
		ZCRowObject row = ZCRowObject.getInstance();
		row.set("EntryType", entryType);
		row.set("ItemName", itemName);
		row.set("LoggedAt", loggedAt);
		row.set("Notes", notes != null ? notes : "");

		boolean isUpdate = idStr != null && !idStr.isEmpty() && !idStr.equalsIgnoreCase("null");

		if (isUpdate) {
			Long rowId = Long.parseLong(idStr);
			row.set("ROWID", rowId);
			table.updateRows(Collections.singletonList(row));
			JSONObject res = new JSONObject();
			res.put("success", true);
			res.put("id", idStr);
			res.put("itemName", itemName);
			sendJson(response, 200, res);
		} else {
			ZCRowObject insertedRow = table.insertRow(row);
			JSONObject res = new JSONObject();
			res.put("success", true);
			res.put("id", getVal(insertedRow, "LogEntries", "ROWID"));
			res.put("itemName", itemName);
			sendJson(response, 201, res);
		}
	}

	private void handleDeleteEntry(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String idStr = request.getParameter("id");
		if (idStr == null || idStr.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "Missing id parameter"));
			return;
		}
		Long rowId = Long.parseLong(idStr);
		ZCObject.getInstance().getTable("LogEntries").deleteRow(rowId);
		sendJson(response, 200, new JSONObject().put("success", true));
	}

	private void handleGetReactions(HttpServletRequest request, HttpServletResponse response) throws Exception {
		ArrayList<ZCRowObject> rows = ZCQL.getInstance().executeQuery("SELECT ROWID, SymptomStartTime, SeverityLevel, Symptoms, Resolution, ResolvedInMinutes, Notes, CREATEDTIME FROM Reactions ORDER BY SymptomStartTime DESC");
		JSONArray jsonArray = new JSONArray();
		for (ZCRowObject row : rows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "Reactions", "ROWID"));
			item.put("symptomStartTime", getVal(row, "Reactions", "SymptomStartTime"));
			item.put("severityLevel", getVal(row, "Reactions", "SeverityLevel"));

			Object symptomsRawObj = getVal(row, "Reactions", "Symptoms");
			String symptomsRaw = symptomsRawObj != null ? symptomsRawObj.toString() : "";
			if (!symptomsRaw.isEmpty()) {
				try {
					item.put("symptoms", new JSONArray(symptomsRaw));
				} catch (Exception e) {
					item.put("symptoms", new JSONArray().put(symptomsRaw));
				}
			} else {
				item.put("symptoms", new JSONArray());
			}

			item.put("resolution", getVal(row, "Reactions", "Resolution"));
			item.put("resolvedInMinutes", getVal(row, "Reactions", "ResolvedInMinutes"));
			item.put("notes", getVal(row, "Reactions", "Notes"));
			item.put("createdAt", getVal(row, "Reactions", "CREATEDTIME"));
			jsonArray.put(item);
		}
		sendJson(response, 200, new JSONObject().put("reactions", jsonArray));
	}

	private void handleSaveReaction(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String idStr = body.optString("id", request.getParameter("id"));
		String symptomStartTime = formatDateTime(body.optString("symptomStartTime", ""));
		int severityLevel = body.optInt("severityLevel", 3);
		JSONArray symptomsArr = body.optJSONArray("symptoms");
		String resolution = body.optString("resolution", "auto");
		int resolvedInMinutes = body.optInt("resolvedInMinutes", 0);
		String notes = body.optString("notes", "");

		if (symptomStartTime.isEmpty()) {
			symptomStartTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
		}

		if (isFutureDateTime(symptomStartTime)) {
			sendJson(response, 400, new JSONObject().put("error", "Cannot add or update reactions for future dates"));
			return;
		}

		ZCTable table = ZCObject.getInstance().getTable("Reactions");
		ZCRowObject row = ZCRowObject.getInstance();
		row.set("SymptomStartTime", symptomStartTime);
		row.set("SeverityLevel", severityLevel);
		if (symptomsArr != null) {
			row.set("Symptoms", symptomsArr.toString());
		} else {
			row.set("Symptoms", "[]");
		}
		row.set("Resolution", resolution);
		row.set("ResolvedInMinutes", resolvedInMinutes);
		row.set("Notes", notes != null ? notes : "");

		boolean isUpdate = idStr != null && !idStr.isEmpty() && !idStr.equalsIgnoreCase("null");

		if (isUpdate) {
			Long rowId = Long.parseLong(idStr);
			row.set("ROWID", rowId);
			table.updateRows(Collections.singletonList(row));
			JSONObject res = new JSONObject();
			res.put("success", true);
			res.put("id", idStr);
			sendJson(response, 200, res);
		} else {
			ZCRowObject insertedRow = table.insertRow(row);
			JSONObject res = new JSONObject();
			res.put("success", true);
			res.put("id", getVal(insertedRow, "Reactions", "ROWID"));
			sendJson(response, 201, res);
		}
	}

	private void handleDeleteReaction(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String idStr = request.getParameter("id");
		if (idStr == null || idStr.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "Missing id parameter"));
			return;
		}
		Long rowId = Long.parseLong(idStr);
		ZCObject.getInstance().getTable("Reactions").deleteRow(rowId);
		sendJson(response, 200, new JSONObject().put("success", true));
	}

	private void handleGetTriggers(HttpServletRequest request, HttpServletResponse response) throws Exception {
		ArrayList<ZCRowObject> rows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, ConfirmedAt FROM ConfirmedTriggers");
		JSONArray jsonArray = new JSONArray();
		for (ZCRowObject row : rows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "ConfirmedTriggers", "ROWID"));
			item.put("itemName", getVal(row, "ConfirmedTriggers", "ItemName"));
			item.put("confirmedAt", getVal(row, "ConfirmedTriggers", "ConfirmedAt"));
			jsonArray.put(item);
		}
		sendJson(response, 200, new JSONObject().put("triggers", jsonArray));
	}

	private void handlePostTrigger(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String itemName = body.optString("itemName", "").trim();
		String confirmedAt = formatDateTime(body.optString("confirmedAt", ""));
		if (confirmedAt.isEmpty()) {
			confirmedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
		}

		if (itemName.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "itemName is required"));
			return;
		}

		if (isFutureDateTime(confirmedAt)) {
			sendJson(response, 400, new JSONObject().put("error", "Cannot add confirmed triggers for future dates"));
			return;
		}

		ZCRowObject row = ZCRowObject.getInstance();
		row.set("ItemName", itemName);
		row.set("ConfirmedAt", confirmedAt);

		ZCTable table = ZCObject.getInstance().getTable("ConfirmedTriggers");
		ZCRowObject insertedRow = table.insertRow(row);

		JSONObject res = new JSONObject();
		res.put("success", true);
		res.put("id", getVal(insertedRow, "ConfirmedTriggers", "ROWID"));
		sendJson(response, 201, res);
	}

	private void handleDeleteTrigger(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String idStr = request.getParameter("id");
		if (idStr == null || idStr.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "Missing id parameter"));
			return;
		}
		Long rowId = Long.parseLong(idStr);
		ZCObject.getInstance().getTable("ConfirmedTriggers").deleteRow(rowId);
		sendJson(response, 200, new JSONObject().put("success", true));
	}

	private void handleGetSuspectedTriggers(HttpServletRequest request, HttpServletResponse response) throws Exception {
		ArrayList<ZCRowObject> rows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, SuspectedAt FROM SuspectedTriggers");
		JSONArray jsonArray = new JSONArray();
		for (ZCRowObject row : rows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "SuspectedTriggers", "ROWID"));
			item.put("itemName", getVal(row, "SuspectedTriggers", "ItemName"));
			item.put("suspectedAt", getVal(row, "SuspectedTriggers", "SuspectedAt"));
			jsonArray.put(item);
		}
		sendJson(response, 200, new JSONObject().put("suspectedTriggers", jsonArray));
	}

	private void handlePostSuspectedTrigger(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String itemName = body.optString("itemName", "").trim();
		String suspectedAt = formatDateTime(body.optString("suspectedAt", ""));
		if (suspectedAt.isEmpty()) {
			suspectedAt = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
		}

		if (itemName.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "itemName is required"));
			return;
		}

		ZCRowObject row = ZCRowObject.getInstance();
		row.set("ItemName", itemName);
		row.set("SuspectedAt", suspectedAt);

		ZCTable table = ZCObject.getInstance().getTable("SuspectedTriggers");
		ZCRowObject insertedRow = table.insertRow(row);

		JSONObject res = new JSONObject();
		res.put("success", true);
		res.put("id", getVal(insertedRow, "SuspectedTriggers", "ROWID"));
		sendJson(response, 201, res);
	}

	private void handleDeleteSuspectedTrigger(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String idStr = request.getParameter("id");
		if (idStr == null || idStr.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "Missing id parameter"));
			return;
		}
		Long rowId = Long.parseLong(idStr);
		ZCObject.getInstance().getTable("SuspectedTriggers").deleteRow(rowId);
		sendJson(response, 200, new JSONObject().put("success", true));
	}

	private String parseDateKey(String dtStr) {
		if (dtStr == null || dtStr.trim().isEmpty()) return "";
		String clean = dtStr.trim().replace("T", " ");
		return clean.split(" ")[0];
	}

	private void handleGetHeatmap(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String monthParam = request.getParameter("month"); // Format "YYYY-MM"
		if (monthParam == null || monthParam.trim().isEmpty() || !monthParam.trim().matches("\\d{4}-\\d{2}")) {
			monthParam = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
		}
		monthParam = monthParam.trim();
		String startDt = monthParam + "-01 00:00:00";

		String[] parts = monthParam.split("-");
		int year = Integer.parseInt(parts[0]);
		int month = Integer.parseInt(parts[1]);
		YearMonth ym = YearMonth.of(year, month);
		int lastDay = ym.lengthOfMonth();
		String endDt = String.format("%s-%02d 23:59:59", monthParam, lastDay);

		JSONObject daysMap = new JSONObject();

		// Query LogEntries for the month
		try {
			String entriesQuery = "SELECT LoggedAt FROM LogEntries WHERE LoggedAt >= '" + startDt + "' AND LoggedAt <= '" + endDt + "'";
			ArrayList<ZCRowObject> entryRows = ZCQL.getInstance().executeQuery(entriesQuery);
			for (ZCRowObject row : entryRows) {
				Object loggedAtObj = getVal(row, "LogEntries", "LoggedAt");
				if (loggedAtObj != null) {
					String dateKey = parseDateKey(loggedAtObj.toString());
					if (!dateKey.isEmpty()) {
						JSONObject dayObj = daysMap.optJSONObject(dateKey);
						if (dayObj == null) {
							dayObj = new JSONObject();
							dayObj.put("entriesCount", 0);
							dayObj.put("reactionsCount", 0);
							dayObj.put("maxSeverity", 0);
							daysMap.put(dateKey, dayObj);
						}
						dayObj.put("entriesCount", dayObj.getInt("entriesCount") + 1);
					}
				}
			}
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Error querying entries for heatmap", e);
		}

		// Query Reactions for the month
		try {
			String reactionsQuery = "SELECT SymptomStartTime, SeverityLevel FROM Reactions WHERE SymptomStartTime >= '" + startDt + "' AND SymptomStartTime <= '" + endDt + "'";
			ArrayList<ZCRowObject> reactionRows = ZCQL.getInstance().executeQuery(reactionsQuery);
			for (ZCRowObject row : reactionRows) {
				Object startObj = getVal(row, "Reactions", "SymptomStartTime");
				Object sevObj = getVal(row, "Reactions", "SeverityLevel");
				if (startObj != null) {
					String dateKey = parseDateKey(startObj.toString());
					if (!dateKey.isEmpty()) {
						JSONObject dayObj = daysMap.optJSONObject(dateKey);
						if (dayObj == null) {
							dayObj = new JSONObject();
							dayObj.put("entriesCount", 0);
							dayObj.put("reactionsCount", 0);
							dayObj.put("maxSeverity", 0);
							daysMap.put(dateKey, dayObj);
						}
						int sev = 1;
						if (sevObj != null) {
							try { sev = Integer.parseInt(sevObj.toString()); } catch (Exception ignored) {}
						}
						dayObj.put("reactionsCount", dayObj.getInt("reactionsCount") + 1);
						if (sev > dayObj.getInt("maxSeverity")) {
							dayObj.put("maxSeverity", sev);
						}
					}
				}
			}
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Error querying reactions for heatmap", e);
		}

		// Determine status colors for each date
		Iterator<String> keys = daysMap.keys();
		while (keys.hasNext()) {
			String dKey = keys.next();
			JSONObject dayObj = daysMap.getJSONObject(dKey);
			int rCount = dayObj.getInt("reactionsCount");
			int eCount = dayObj.getInt("entriesCount");
			int maxSev = dayObj.getInt("maxSeverity");
			if (rCount > 0) {
				dayObj.put("status", maxSev >= 3 ? "status-severe" : "status-mild");
			} else if (eCount > 0) {
				dayObj.put("status", "status-safe");
			} else {
				dayObj.put("status", "");
			}
		}

		// Suspected Triggers
		JSONArray suspectedArray = new JSONArray();
		try {
			ArrayList<ZCRowObject> sRows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, SuspectedAt FROM SuspectedTriggers");
			for (ZCRowObject row : sRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "SuspectedTriggers", "ROWID"));
				item.put("itemName", getVal(row, "SuspectedTriggers", "ItemName"));
				item.put("suspectedAt", getVal(row, "SuspectedTriggers", "SuspectedAt"));
				suspectedArray.put(item);
			}
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Error querying SuspectedTriggers", e);
		}

		// Confirmed Triggers
		JSONArray confirmedArray = new JSONArray();
		try {
			ArrayList<ZCRowObject> cRows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, ConfirmedAt FROM ConfirmedTriggers");
			for (ZCRowObject row : cRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "ConfirmedTriggers", "ROWID"));
				item.put("itemName", getVal(row, "ConfirmedTriggers", "ItemName"));
				item.put("confirmedAt", getVal(row, "ConfirmedTriggers", "ConfirmedAt"));
				confirmedArray.put(item);
			}
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Error querying ConfirmedTriggers", e);
		}

		JSONObject res = new JSONObject();
		res.put("month", monthParam);
		res.put("days", daysMap);
		res.put("suspectedTriggers", suspectedArray);
		res.put("confirmedTriggers", confirmedArray);
		sendJson(response, 200, res);
	}

	private void handleGetDayDetails(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String dateParam = request.getParameter("date");
		if (dateParam == null || dateParam.trim().isEmpty()) {
			dateParam = LocalDate.now().toString();
		}
		dateParam = dateParam.trim();
		String startDt = dateParam + " 00:00:00";
		String endDt = dateParam + " 23:59:59";

		JSONArray entriesArray = new JSONArray();
		try {
			String entriesQuery = "SELECT ROWID, EntryType, ItemName, LoggedAt, Notes, CREATEDTIME FROM LogEntries WHERE LoggedAt >= '" + startDt + "' AND LoggedAt <= '" + endDt + "' ORDER BY LoggedAt DESC";
			ArrayList<ZCRowObject> entryRows = ZCQL.getInstance().executeQuery(entriesQuery);
			for (ZCRowObject row : entryRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "LogEntries", "ROWID"));
				item.put("entryType", getVal(row, "LogEntries", "EntryType"));
				item.put("itemName", getVal(row, "LogEntries", "ItemName"));
				item.put("loggedAt", getVal(row, "LogEntries", "LoggedAt"));
				item.put("notes", getVal(row, "LogEntries", "Notes"));
				item.put("createdAt", getVal(row, "LogEntries", "CREATEDTIME"));
				entriesArray.put(item);
			}
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Error querying entries for date " + dateParam, e);
		}

		JSONArray reactionsArray = new JSONArray();
		try {
			String reactionsQuery = "SELECT ROWID, SymptomStartTime, SeverityLevel, Symptoms, Resolution, ResolvedInMinutes, Notes, CREATEDTIME FROM Reactions WHERE SymptomStartTime >= '" + startDt + "' AND SymptomStartTime <= '" + endDt + "' ORDER BY SymptomStartTime DESC";
			ArrayList<ZCRowObject> reactionRows = ZCQL.getInstance().executeQuery(reactionsQuery);
			for (ZCRowObject row : reactionRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "Reactions", "ROWID"));
				item.put("symptomStartTime", getVal(row, "Reactions", "SymptomStartTime"));
				item.put("severityLevel", getVal(row, "Reactions", "SeverityLevel"));

				Object symptomsRawObj = getVal(row, "Reactions", "Symptoms");
				String symptomsRaw = symptomsRawObj != null ? symptomsRawObj.toString() : "";
				if (!symptomsRaw.isEmpty()) {
					try {
						item.put("symptoms", new JSONArray(symptomsRaw));
					} catch (Exception ex) {
						item.put("symptoms", new JSONArray().put(symptomsRaw));
					}
				} else {
					item.put("symptoms", new JSONArray());
				}

				item.put("resolution", getVal(row, "Reactions", "Resolution"));
				item.put("resolvedInMinutes", getVal(row, "Reactions", "ResolvedInMinutes"));
				item.put("notes", getVal(row, "Reactions", "Notes"));
				item.put("createdAt", getVal(row, "Reactions", "CREATEDTIME"));
				reactionsArray.put(item);
			}
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Error querying reactions for date " + dateParam, e);
		}

		JSONObject res = new JSONObject();
		res.put("date", dateParam);
		res.put("entriesCount", entriesArray.length());
		res.put("reactionsCount", reactionsArray.length());
		res.put("entries", entriesArray);
		res.put("reactions", reactionsArray);
		sendJson(response, 200, res);
	}

	private void handleGetDashboard(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject res = new JSONObject();

		try {
			ArrayList<ZCRowObject> entryRows = ZCQL.getInstance().executeQuery("SELECT ROWID, EntryType, ItemName, LoggedAt, Notes, CREATEDTIME FROM LogEntries ORDER BY LoggedAt DESC");
			JSONArray entriesArray = new JSONArray();
			for (ZCRowObject row : entryRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "LogEntries", "ROWID"));
				item.put("entryType", getVal(row, "LogEntries", "EntryType"));
				item.put("itemName", getVal(row, "LogEntries", "ItemName"));
				item.put("loggedAt", getVal(row, "LogEntries", "LoggedAt"));
				item.put("notes", getVal(row, "LogEntries", "Notes"));
				item.put("createdAt", getVal(row, "LogEntries", "CREATEDTIME"));
				entriesArray.put(item);
			}
			res.put("entries", entriesArray);
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Failed fetching LogEntries in dashboard", e);
			res.put("entries", new JSONArray());
		}

		try {
			ArrayList<ZCRowObject> reactionRows = ZCQL.getInstance().executeQuery("SELECT ROWID, SymptomStartTime, SeverityLevel, Symptoms, Resolution, ResolvedInMinutes, Notes, CREATEDTIME FROM Reactions ORDER BY SymptomStartTime DESC");
			JSONArray reactionsArray = new JSONArray();
			for (ZCRowObject row : reactionRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "Reactions", "ROWID"));
				item.put("symptomStartTime", getVal(row, "Reactions", "SymptomStartTime"));
				item.put("severityLevel", getVal(row, "Reactions", "SeverityLevel"));

				Object symptomsRawObj = getVal(row, "Reactions", "Symptoms");
				String symptomsRaw = symptomsRawObj != null ? symptomsRawObj.toString() : "";
				if (!symptomsRaw.isEmpty()) {
					try {
						item.put("symptoms", new JSONArray(symptomsRaw));
					} catch (Exception ex) {
						item.put("symptoms", new JSONArray().put(symptomsRaw));
					}
				} else {
					item.put("symptoms", new JSONArray());
				}

				item.put("resolution", getVal(row, "Reactions", "Resolution"));
				item.put("resolvedInMinutes", getVal(row, "Reactions", "ResolvedInMinutes"));
				item.put("notes", getVal(row, "Reactions", "Notes"));
				item.put("createdAt", getVal(row, "Reactions", "CREATEDTIME"));
				reactionsArray.put(item);
			}
			res.put("reactions", reactionsArray);
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Failed fetching Reactions in dashboard", e);
			res.put("reactions", new JSONArray());
		}

		try {
			ArrayList<ZCRowObject> triggerRows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, ConfirmedAt FROM ConfirmedTriggers");
			JSONArray triggersArray = new JSONArray();
			for (ZCRowObject row : triggerRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "ConfirmedTriggers", "ROWID"));
				item.put("itemName", getVal(row, "ConfirmedTriggers", "ItemName"));
				item.put("confirmedAt", getVal(row, "ConfirmedTriggers", "ConfirmedAt"));
				triggersArray.put(item);
			}
			res.put("confirmedTriggers", triggersArray);
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Failed fetching ConfirmedTriggers in dashboard", e);
			res.put("confirmedTriggers", new JSONArray());
		}

		try {
			ArrayList<ZCRowObject> sRows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, SuspectedAt FROM SuspectedTriggers");
			JSONArray suspectedArray = new JSONArray();
			for (ZCRowObject row : sRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "SuspectedTriggers", "ROWID"));
				item.put("itemName", getVal(row, "SuspectedTriggers", "ItemName"));
				item.put("suspectedAt", getVal(row, "SuspectedTriggers", "SuspectedAt"));
				suspectedArray.put(item);
			}
			res.put("suspectedTriggers", suspectedArray);
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Failed fetching SuspectedTriggers in dashboard", e);
			res.put("suspectedTriggers", new JSONArray());
		}

		// Static user object — no Catalyst auth user needed
		JSONObject userObj = new JSONObject();
		userObj.put("first_name", getEnv("CHPPER_USER","Admin"));
		userObj.put("email_id", "");
		res.put("user", userObj);

		LOGGER.log(Level.INFO, "Dashboard response size: entries=" +
			res.optJSONArray("entries").length() + " reactions=" +
			res.optJSONArray("reactions").length() + " triggers=" +
			res.optJSONArray("confirmedTriggers").length());
		sendJson(response, 200, res);
	}

	// ── Path Extraction ───────────────────────────────────────────────────────────

	/**
	 * Extracts the last path segment from a URI for strict route matching.
	 * Strips the query string first, then returns the token after the final '/'.
	 * Examples:
	 *   "/server/chopper_api/execute/auth"       -> "auth"
	 *   "/server/chopper_api/execute/entries?id=1" -> "entries"
	 *   "/server/chopper_api/execute/"           -> ""
	 */
	private String extractPath(String uri) {
		// Strip query string
		int queryIdx = uri.indexOf('?');
		String path = queryIdx >= 0 ? uri.substring(0, queryIdx) : uri;

		// Strip trailing slash
		if (path.endsWith("/")) {
			path = path.substring(0, path.length() - 1);
		}

		// Return last segment after the final '/'
		int lastSlash = path.lastIndexOf('/');
		return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
	}

	// ── Shared Utilities ──────────────────────────────────────────────────────────

	private Object getVal(ZCRowObject row, String tableName, String columnName) {
		try {
			return row.get(tableName, columnName);
		} catch (Exception e) {
			return null;
		}
	}

	private JSONObject parseBody(HttpServletRequest request) throws IOException {
		StringBuilder sb = new StringBuilder();
		BufferedReader reader = request.getReader();
		String line;
		while ((line = reader.readLine()) != null) {
			sb.append(line);
		}
		String bodyStr = sb.toString().trim();
		if (bodyStr.isEmpty()) return new JSONObject();
		try {
			return new JSONObject(bodyStr);
		} catch (Exception e) {
			return new JSONObject();
		}
	}

	private void sendJson(HttpServletResponse response, int status, JSONObject json) throws IOException {
		response.setStatus(status);
		response.setContentType("application/json");
		response.setCharacterEncoding("UTF-8");
		response.getWriter().write(json.toString());
	}


	/**
	 * Retrieves an environment variable. Reads System.getenv() first.
	 * Falls back to reading local .env file ONLY when running locally.
	 */
	private static synchronized String getEnv(String key, String defaultValue) {
		String val = System.getenv(key);
		if (val != null && !val.trim().isEmpty()) {
			return val.trim();
		}
		return defaultValue;
	}

	/**
	 * Sets CORS headers strictly for local development requests (localhost / 127.0.0.1).
	 * In production, Catalyst Console CORS configuration handles headers automatically.
	 */
	private void handleLocalCors(HttpServletRequest request, HttpServletResponse response) {
		String origin = request.getHeader("Origin");
		if (origin != null && (origin.contains("localhost") || origin.contains("127.0.0.1"))) {
			response.setHeader("Access-Control-Allow-Origin", origin);
			response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
			response.setHeader("Access-Control-Allow-Headers", "X-Chopper-Token, Content-Type, Authorization");
			response.setHeader("Access-Control-Max-Age", "86400");
		}
	}
}