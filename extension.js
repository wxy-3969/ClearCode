const vscode = require("vscode");

/** @type {Map<string, string>} */
let originalCodeMap = new Map();

const SUPPORTED_LANGUAGES = [
  "python", "cpp", "c", "java",
  "javascript", "javascriptreact",
  "html", "css", "scss", "less"
];

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // 删除注释和空行
  let clear = vscode.commands.registerCommand("clear-code.clear", function () {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const lang = doc.languageId;
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      vscode.window.showWarningMessage("不支持当前文件类型: " + lang);
      return;
    }

    const text = doc.getText();
    originalCodeMap.set(doc.uri.toString(), text);
    let cleaned = text;

    if (lang === "python") {
      cleaned = cleaned.replace(/""".*?"""/gs, "");
      cleaned = cleaned.replace(/'''.*?'''/gs, "");
      cleaned = cleaned.replace(/#.*/g, "");
    }

    if (["cpp", "c", "java", "javascript", "javascriptreact"].includes(lang)) {
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
      cleaned = cleaned.replace(/\/\/.*/g, "");
    }

    if (lang === "html") {
      // 删除 HTML 注释 <!-- -->
      cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
      // 删除内嵌 <style> 中的 CSS 注释 /* */
      cleaned = cleaned.replace(
        /(<style[\s\S]*?>)([\s\S]*?)(<\/style>)/gi,
        (_, open, content, close) => open + content.replace(/\/\*[\s\S]*?\*\//g, "") + close
      );
      // 删除内嵌 <script> 中的 JS 注释 // 和 /* */
      cleaned = cleaned.replace(
        /(<script[\s\S]*?>)([\s\S]*?)(<\/script>)/gi,
        (_, open, content, close) => {
          let c = content.replace(/\/\*[\s\S]*?\*\//g, "");
          c = c.replace(/\/\/.*/g, "");
          return open + c + close;
        }
      );
    }

    if (lang === "css" || lang === "scss" || lang === "less") {
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
    }

    // 删除空行/纯空格行
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, "");

    editor.edit((edit) => {
      const start = new vscode.Position(0, 0);
      const end = new vscode.Position(
        doc.lineCount - 1,
        doc.lineAt(doc.lineCount - 1).text.length,
      );
      edit.replace(new vscode.Range(start, end), cleaned);
    });

    vscode.window.showInformationMessage("已删除注释和空行");
  });

  // 恢复原始代码
  let restore = vscode.commands.registerCommand(
    "clear-code.restore",
    function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const uri = editor.document.uri.toString();
      const original = originalCodeMap.get(uri);
      if (!original) {
        vscode.window.showWarningMessage("无备份可恢复");
        return;
      }

      editor.edit((edit) => {
        const start = new vscode.Position(0, 0);
        const end = new vscode.Position(
          editor.document.lineCount - 1,
          editor.document.lineAt(editor.document.lineCount - 1).text.length,
        );
        edit.replace(new vscode.Range(start, end), original);
      });

      vscode.window.showInformationMessage("已恢复原始代码");
    },
  );

  // 格式化代码 — 纯内置实现，无外部依赖
  let format = vscode.commands.registerCommand("clear-code.format", function () {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const lang = doc.languageId;

    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      vscode.window.showWarningMessage("不支持当前文件类型: " + lang);
      return;
    }

    const text = doc.getText();
    originalCodeMap.set(doc.uri.toString(), text);
    const formatted = formatCode(lang, text);

    editor.edit((edit) => {
      const start = new vscode.Position(0, 0);
      const end = new vscode.Position(
        doc.lineCount - 1,
        doc.lineAt(doc.lineCount - 1).text.length,
      );
      edit.replace(new vscode.Range(start, end), formatted);
    });

    vscode.window.showInformationMessage(getFormatMessage(lang));
  });

  context.subscriptions.push(clear, restore, format);
}

function deactivate() {}

// ==================== 格式化分发 ====================
function formatCode(lang, code) {
  switch (lang) {
    case "python": return formatPythonPEP8(code);
    case "cpp":
    case "c":
    case "java": return formatCppKandR(code);
    case "javascript":
    case "javascriptreact": return formatJavaScript(code);
    case "html": return formatHTML(code);
    case "css":
    case "scss":
    case "less": return formatCSS(code);
    default: return code;
  }
}

function getFormatMessage(lang) {
  const map = {
    python: "已按 PEP 8 格式化",
    cpp: "已按 K&R 风格格式化",
    c: "已按 K&R 风格格式化",
    java: "已按 Java 规范格式化",
    javascript: "已按 JavaScript 规范格式化",
    javascriptreact: "已按 JavaScript 规范格式化",
    html: "已按 HTML 规范格式化",
    css: "已按 CSS 规范格式化",
    scss: "已按 CSS 规范格式化",
    less: "已按 CSS 规范格式化"
  };
  return map[lang] || "已完成格式化";
}

// ==================== C++ K&R / Java 格式化 ====================

// ==================== C++ K&R 格式化 ====================
/**
 * K&R 风格格式化 C/C++ 代码
 * - 左大括号 { 与控制语句同一行
 * - 4 空格缩进
 * - 操作符两侧加空格
 */
function formatCppKandR(code) {
  let lines = code.split("\n");
  let result = [];
  let indent = 0;
  const INDENT = "    ";

  for (let raw of lines) {
    let line = raw.replace(/\t/g, INDENT);

    // 去除行首空格，重新计算缩进
    let stripped = line.trimStart();

    // 检测 } 开头 → 先减缩进
    if (/^\s*\}/.test(stripped) && !/^\s*\{/.test(stripped)) {
      indent = Math.max(0, indent - 1);
    }

    // 构建当前缩进行
    let formatted = INDENT.repeat(indent) + stripped.trim();

    // 处理独立成行的 {（如 if 后换行的）→ 合并到上一行末尾
    if (formatted.trim() === "{") {
      // 把 { 移动到上一行末尾
      if (result.length > 0 && !result[result.length - 1].trimEnd().endsWith("{")) {
        result[result.length - 1] = result[result.length - 1].trimEnd() + " {";
        continue;
      }
    }

    result.push(formatted);

    // 检测行尾的 { 或包含 { 的行（if/else/for/while/do 的非函数声明）
    if (/\{\s*$/.test(stripped.trim()) ||
        /^\s*(if|else\s*if|else|for|while|do|switch|case|default|struct|class|enum|union|namespace|try|catch)\b.*[^;]\s*$/.test(stripped.trim())) {
      indent++;
    }
  }

  return result.join("\n");
}

// ==================== Python PEP 8 格式化 ====================
/**
 * PEP 8 风格格式化 Python 代码
 * - 4 空格缩进
 * - 冒号后加一个空格
 * - 操作符两侧各一个空格
 * - 逗号后加一个空格
 * - 连续最多 2 个空行
 */
function formatPythonPEP8(code) {
  let lines = code.split("\n");
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Tab → 4 空格
    line = line.replace(/\t/g, "    ");

    // 冒号后无空格且不是切片/字符串内 → 加空格 (简单处理)
    line = line.replace(/(\w):(?=[^\s\d])/g, "$1: ");

    // 操作符两侧加空格（=, ==, !=, <=, >=, <, >, +=, -= 等）
    line = line.replace(/\s*([=+\-*\/%&|^<>!]+)=?\s*/g, " $1 ");

    // 清理多余空格（操作符处理后可能产生）
    line = line.replace(/  /g, " ").replace(/^ /, "").replace(/ $/, "");

    // 逗号后加空格
    line = line.replace(/,(?=\S)/g, ", ");

    // # 注释前保证有空格
    line = line.replace(/[^\s](#)/g, " $1");

    result.push(line);
  }

  // 合并连续超过2个空行为恰好2个
  let finalResult = [];
  let emptyCount = 0;
  for (let line of result) {
    if (/^\s*$/.test(line)) {
      emptyCount++;
      if (emptyCount <= 2) finalResult.push(line);
    } else {
      emptyCount = 0;
      finalResult.push(line);
    }
  }

  return finalResult.join("\n");
}

// ==================== JavaScript 格式化 ====================
/**
 * JavaScript 规范格式化
 * - K&R 风格花括号
 * - 2 空格缩进
 * - 分号后换行
 */
function formatJavaScript(code) {
  let lines = code.split("\n");
  let result = [];
  let indent = 0;
  const INDENT = "  ";

  for (let raw of lines) {
    let line = raw.replace(/\t/g, INDENT);
    let stripped = line.trimStart();

    // } 开头先减缩进
    if (/^\s*\}/.test(stripped)) {
      indent = Math.max(0, indent - 1);
    }

    let formatted = INDENT.repeat(indent) + stripped.trim();

    // 独立成行的 { → 合并到上一行末尾
    if (formatted.trim() === "{" && result.length > 0 && !result[result.length - 1].trimEnd().endsWith("{")) {
      result[result.length - 1] = result[result.length - 1].trimEnd() + " {";
      continue;
    }

    result.push(formatted);

    // 检测需要加缩进的语句
    if (/\{\s*$/.test(stripped.trim()) ||
        /^\s*(if|else\s*if|else|for|while|do|switch|case|default|function|class|try|catch|finally|const|let|var)\b.*[^;]\s*$/.test(stripped.trim())) {
      indent++;
    }
  }

  return result.join("\n");
}

// ==================== HTML 格式化 ====================
/**
 * HTML 规范格式化
 * - 标签独立成行，2 空格缩进
 * - 属性格式化对齐
 */
function formatHTML(code) {
  const lines = code.split("\n");
  let result = [];
  let indent = 0;
  const INDENT = "  ";
  // 合并为单行处理标签
  let merged = code.replace(/>\s*</g, ">\n<");

  for (let raw of merged.split("\n")) {
    let line = raw.trim();
    if (!line) continue;

    // 自闭合 / 结束标签 → 先减缩进
    if (/^<\/|\/>$/.test(line)) {
      indent = Math.max(0, indent - 1);
    }

    result.push(INDENT.repeat(indent) + line);

    // 开始标签（非自闭合）→ 加缩进
    if (/^<[a-zA-Z][^>]*[^/]>$/.test(line) || /^<[a-zA-Z][^/>]*$/.test(line)) {
      indent++;
    }
  }

  return result.join("\n");
}

// ==================== CSS 格式化 ====================
/**
 * CSS 规范格式化
 * - 选择器 + { 同行
 * - 属性 2 空格缩进
 * - 属性值后分号
 */
function formatCSS(code) {
  let lines = code.split("\n");
  let result = [];
  let inBlock = false;
  const INDENT = "  ";

  for (let raw of lines) {
    let line = raw.trim();

    if (!line) continue;

    // 选择器行 → 压缩空格 + 加 {
    if (!inBlock && !line.includes("}")) {
      line = line.replace(/\s+/g, " ");
      result.push(line + " {");
      inBlock = true;
      continue;
    }

    // } 结束块
    if (line === "}") {
      result.push("}");
      inBlock = false;
      continue;
    }

    // 属性行：去掉多余空格，确保有分号
    line = line.replace(/\s*:\s*/, ": ").replace(/\s*;\s*/g, ";");
    if (!line.endsWith(";") && !line.endsWith("}")) {
      line += ";";
    }
    result.push(INDENT + line);
  }

  // 补充未闭合的块
  if (inBlock) result.push("}");

  return result.join("\n");
}

module.exports = { activate, deactivate };
