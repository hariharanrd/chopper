import java.io.BufferedReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.logging.Level;
import java.util.logging.Logger;

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

	@Override
	public void runner(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String uri = request.getRequestURI();
		if (uri == null) uri = "";
		String method = request.getMethod().toUpperCase();

		if ("OPTIONS".equalsIgnoreCase(method)) {
			response.setStatus(204);
			return;
		}

		LOGGER.log(Level.INFO, "Request Received: Method=" + method + ", URI=" + uri);

		try {
			if (uri.contains("/entries")) {
				if ("GET".equals(method)) {
					handleGetEntries(request, response);
				} else if ("POST".equals(method)) {
					handlePostEntry(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteEntry(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if (uri.contains("/reactions")) {
				if ("GET".equals(method)) {
					handleGetReactions(request, response);
				} else if ("POST".equals(method)) {
					handlePostReaction(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteReaction(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if (uri.contains("/triggers")) {
				if ("GET".equals(method)) {
					handleGetTriggers(request, response);
				} else if ("POST".equals(method)) {
					handlePostTrigger(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteTrigger(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if (uri.contains("/dashboard")) {
				if ("GET".equals(method)) {
					handleGetDashboard(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else {
				if ("GET".equals(method)) {
					handleGetDashboard(request, response);
				} else {
					sendJson(response, 404, new JSONObject().put("error", "Endpoint not found: " + uri));
				}
			}
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, "Error handling request", e);
			sendJson(response, 500, new JSONObject().put("error", e.getMessage() != null ? e.getMessage() : "Internal server error"));
		}
	}

	private String formatDateTime(String dt) {
		if (dt == null) return "";
		String clean = dt.trim().replace("T", " ");
		if (clean.length() == 16) {
			clean += ":00";
		}
		return clean;
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

	private void handlePostEntry(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String entryType = body.optString("entryType", "food");
		String itemName = body.optString("itemName", "").trim();
		String loggedAt = formatDateTime(body.optString("loggedAt", ""));
		String notes = body.optString("notes", "");

		if (itemName.isEmpty() || loggedAt.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "itemName and loggedAt are required"));
			return;
		}

		ZCRowObject row = ZCRowObject.getInstance();
		row.set("EntryType", entryType);
		row.set("ItemName", itemName);
		row.set("LoggedAt", loggedAt);
		if (!notes.isEmpty()) {
			row.set("Notes", notes);
		}

		ZCTable table = ZCObject.getInstance().getTable("LogEntries");
		ZCRowObject insertedRow = table.insertRow(row);

		JSONObject res = new JSONObject();
		res.put("success", true);
		res.put("id", getVal(insertedRow, "LogEntries", "ROWID"));
		res.put("itemName", itemName);
		sendJson(response, 201, res);
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

	private void handlePostReaction(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String symptomStartTime = formatDateTime(body.optString("symptomStartTime", ""));
		int severityLevel = body.optInt("severityLevel", 3);
		JSONArray symptomsArr = body.optJSONArray("symptoms");
		String resolution = body.optString("resolution", "auto");
		int resolvedInMinutes = body.optInt("resolvedInMinutes", 0);
		String notes = body.optString("notes", "");

		if (symptomStartTime.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "symptomStartTime is required"));
			return;
		}

		ZCRowObject row = ZCRowObject.getInstance();
		row.set("SymptomStartTime", symptomStartTime);
		row.set("SeverityLevel", severityLevel);
		if (symptomsArr != null) {
			row.set("Symptoms", symptomsArr.toString());
		} else {
			row.set("Symptoms", "[]");
		}
		row.set("Resolution", resolution);
		if (resolvedInMinutes > 0) {
			row.set("ResolvedInMinutes", resolvedInMinutes);
		}
		if (!notes.isEmpty()) {
			row.set("Notes", notes);
		}

		ZCTable table = ZCObject.getInstance().getTable("Reactions");
		ZCRowObject insertedRow = table.insertRow(row);

		JSONObject res = new JSONObject();
		res.put("success", true);
		res.put("id", getVal(insertedRow, "Reactions", "ROWID"));
		sendJson(response, 201, res);
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

		if (itemName.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "itemName is required"));
			return;
		}

		ZCRowObject row = ZCRowObject.getInstance();
		row.set("ItemName", itemName);
		row.set("ConfirmedAt", confirmedAt.isEmpty() ? "2026-07-30 22:30:00" : confirmedAt);

		ZCTable table = ZCObject.getInstance().getTable("ConfirmedTriggers");
		ZCRowObject insertedRow = table.insertRow(row);

		JSONObject res = new JSONObject();
		res.put("success", true);
		res.put("id", getVal(insertedRow, "ConfirmedTriggers", "ROWID"));
		res.put("itemName", itemName);
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

	private void handleGetDashboard(HttpServletRequest request, HttpServletResponse response) throws Exception {
		ArrayList<ZCRowObject> entryRows = ZCQL.getInstance().executeQuery("SELECT ROWID, EntryType, ItemName, LoggedAt, Notes, CREATEDTIME FROM LogEntries ORDER BY LoggedAt DESC");
		ArrayList<ZCRowObject> reactionRows = ZCQL.getInstance().executeQuery("SELECT ROWID, SymptomStartTime, SeverityLevel, Symptoms, Resolution, ResolvedInMinutes, Notes, CREATEDTIME FROM Reactions ORDER BY SymptomStartTime DESC");
		ArrayList<ZCRowObject> triggerRows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, ConfirmedAt FROM ConfirmedTriggers");

		JSONArray entriesArr = new JSONArray();
		for (ZCRowObject row : entryRows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "LogEntries", "ROWID"));
			item.put("entryType", getVal(row, "LogEntries", "EntryType"));
			item.put("itemName", getVal(row, "LogEntries", "ItemName"));
			item.put("loggedAt", getVal(row, "LogEntries", "LoggedAt"));
			item.put("notes", getVal(row, "LogEntries", "Notes"));
			item.put("createdAt", getVal(row, "LogEntries", "CREATEDTIME"));
			entriesArr.put(item);
		}

		JSONArray reactionsArr = new JSONArray();
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
			reactionsArr.put(item);
		}

		JSONArray triggersArr = new JSONArray();
		for (ZCRowObject row : triggerRows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "ConfirmedTriggers", "ROWID"));
			item.put("itemName", getVal(row, "ConfirmedTriggers", "ItemName"));
			item.put("confirmedAt", getVal(row, "ConfirmedTriggers", "ConfirmedAt"));
			triggersArr.put(item);
		}

		JSONObject dashboard = new JSONObject();
		dashboard.put("entries", entriesArr);
		dashboard.put("reactions", reactionsArr);
		dashboard.put("confirmedTriggers", triggersArr);

		sendJson(response, 200, dashboard);
	}

	private Object getVal(ZCRowObject row, String tableName, String colName) {
		if (row == null) return null;
		try {
			Object val = row.get(tableName, colName);
			if (val != null) return val;
		} catch (Exception e) {
			// ignore
		}
		try {
			return row.get(colName);
		} catch (Exception e) {
			return null;
		}
	}

	private JSONObject parseBody(HttpServletRequest request) {
		StringBuilder sb = new StringBuilder();
		try (BufferedReader reader = request.getReader()) {
			String line;
			while ((line = reader.readLine()) != null) {
				sb.append(line);
			}
		} catch (IOException e) {
			LOGGER.log(Level.WARNING, "Failed reading request body", e);
		}
		String bodyStr = sb.toString().trim();
		if (bodyStr.isEmpty()) return new JSONObject();
		try {
			return new JSONObject(bodyStr);
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Failed parsing JSON body: " + bodyStr, e);
			return new JSONObject();
		}
	}

	private void sendJson(HttpServletResponse response, int statusCode, JSONObject data) throws IOException {
		response.setStatus(statusCode);
		response.setContentType("application/json");
		response.setCharacterEncoding("UTF-8");
		response.getWriter().write(data.toString());
	}
}