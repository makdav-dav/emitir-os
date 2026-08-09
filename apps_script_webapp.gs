// ============================================================
//  EMITIR OS — Web App (doPost) — Gerador do Documento de OS
//  Recebe o payload curado do app web e gera o Google Doc a
//  partir do template, devolvendo a URL. Porta a lógica do
//  gerarDocumentoOS (v13) para um endpoint.
//
//  COMO USAR:
//   1. Cole este arquivo no projeto Apps Script.
//   2. Defina o segredo em Configurações do projeto (engrenagem) →
//      Propriedades do script → adicione OS_TOKEN = <seu segredo>.
//      Use o MESMO valor em os_config.OS_WEBAPP_TOKEN no Supabase.
//   3. Implantar → App da Web (Executar como: Eu · Acesso: Qualquer pessoa).
//   4. Copie a URL /exec para os_config.OS_WEBAPP_URL.
//   (O token NÃO fica no código — some o risco de vazar no git.)
// ============================================================

// Segredo lido das Propriedades do script (não versionado).
function _token() {
  return PropertiesService.getScriptProperties().getProperty('OS_TOKEN') || '';
}

var COR_TIPO = {
  "Jardinagem":  { header: "#1A237E", bg: "#E8EAF6" },
  "Poda/Corte":  { header: "#1B5E20", bg: "#E8F5E9" },
  "Arborização": { header: "#BF360C", bg: "#FBE9E7" },
  "Outros":      { header: "#37474F", bg: "#ECEFF1" }
};

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return _json({ ok: true, msg: "Emitir OS Web App ativo. Use POST." }); }

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var tk = _token();
    if (!tk) return _json({ ok: false, erro: "Web App sem OS_TOKEN configurado (Propriedades do script)." });
    if (payload.token !== tk) return _json({ ok: false, erro: "Token inválido." });

    // ── ação: geocodificar um endereço ──
    if (payload.action === "geocode") {
      var end = String(payload.endereco || "").trim();
      if (!end) return _json({ ok: false, erro: "Endereço vazio." });
      var suf = payload.sufixo || "";
      var q = (/campo largo|,\s*pr\b|paran/i.test(end)) ? end : end + suf;
      var g = Maps.newGeocoder().setRegion("br").geocode(q);
      if (g.status === "OK" && g.results.length > 0) {
        var r0 = g.results[0];
        var loc = r0.geometry.location;
        // ── proteção: confere se caiu mesmo em Campo Largo ──
        var municipio = "";
        var comps = r0.address_components || [];
        for (var i = 0; i < comps.length; i++) {
          if (comps[i].types && comps[i].types.indexOf("administrative_area_level_2") >= 0) {
            municipio = comps[i].long_name; break;
          }
        }
        var foraCidade = !/campo largo/i.test(municipio);
        return _json({ ok: true, lat: loc.lat, lng: loc.lng, municipio: municipio, fora_cidade: foraCidade });
      }
      return _json({ ok: false, erro: "Endereço não encontrado." });
    }

    // ── ação padrão: gerar o documento ──
    var res = gerarDocDePayload(payload);
    return _json({ ok: true, url: res.url, docId: res.docId, nome: res.nome });
  } catch (err) {
    return _json({ ok: false, erro: String(err && err.message || err) });
  }
}

// ── Estilos (iguais ao script original) ─────────────────────
function _estilos() {
  var A = DocumentApp.Attribute, H = DocumentApp.HorizontalAlignment;
  function base(sz, bold, align, italic) {
    var s = {}; s[A.FONT_FAMILY] = "Arial"; s[A.FONT_SIZE] = sz;
    s[A.BOLD] = !!bold; s[A.ITALIC] = !!italic;
    s[A.HORIZONTAL_ALIGNMENT] = align; s[A.FOREGROUND_COLOR] = "#000000";
    return s;
  }
  return {
    titulo: base(10, true,  H.CENTER),
    normal: base(10, false, H.CENTER),
    just:   base(10, false, H.JUSTIFY),
    esq:    base(10, true,  H.LEFT),
    assin:  base(10, false, H.CENTER),
    cargo:  base(9,  false, H.CENTER, true)
  };
}

function _nomeMes(m) {
  return ["janeiro","fevereiro","março","abril","maio","junho",
          "julho","agosto","setembro","outubro","novembro","dezembro"][m];
}

// ── Geração do documento a partir do payload ────────────────
// payload = {
//   token, config: { numero_formatado, contrato, empresa, data_limite,
//                    responsavel1, cargo1, responsavel2, cargo2,
//                    template_id, tipos_ordem: ["Poda/Corte", ...] },
//   tipos: [ { tipo, itens: [ { processo, data_entrada, endereco,
//              ponto_ref, trabalho, data_exec, prioridade, pendente } ] } ]
// }
function gerarDocDePayload(payload) {
  var cfg = payload.config || {};
  var st = _estilos();
  var nomeDoc = "OS " + (cfg.numero_formatado || "") + " — Campo Largo";

  var templateFile = DriveApp.getFileById(cfg.template_id);
  var copiaFile = templateFile.makeCopy(nomeDoc);
  var doc = DocumentApp.openById(copiaFile.getId());
  var body = doc.getBody();
  body.clear();

  var servicos = cfg.servicos_desc || "Corte e Poda";

  body.appendParagraph("SECRETARIA MUNICIPAL DE MEIO AMBIENTE").setAttributes(st.titulo);
  body.appendParagraph("SUPERINTENDÊNCIA DE PRESERVAÇÃO E SUSTENTABILIDADE AMBIENTAL").setAttributes(st.titulo);
  body.appendParagraph("DEPARTAMENTO DE PRODUÇÃO VEGETAL E ARBORIZAÇÃO").setAttributes(st.titulo);
  body.appendParagraph("DIVISÃO DO HORTO MUNICIPAL").setAttributes(st.titulo);
  body.appendParagraph("").setAttributes(st.normal);
  body.appendParagraph("CONTRATO n° " + (cfg.contrato || "")).setAttributes(st.normal);
  body.appendParagraph("ORDEM DE SERVIÇO " + (cfg.numero_formatado || "")).setAttributes(st.titulo);
  body.appendParagraph("À " + (cfg.empresa || "")).setAttributes(st.normal);
  body.appendParagraph("").setAttributes(st.normal);

  body.appendParagraph(
    'O Município de Campo Largo, através da Secretaria Municipal de Meio Ambiente de Campo Largo ' +
    '(SMMA-CL), por meio da Divisão do Horto Municipal, vinculada ao Departamento de Produção Vegetal ' +
    'e Arborização, através da presente ORDEM DE SERVIÇO, orienta que os serviços de "' + servicos + '", ' +
    'deverão ser realizados com possível alteração devido às intempéries climáticas.'
  ).setAttributes(st.just);
  body.appendParagraph("").setAttributes(st.normal);
  body.appendParagraph(
    'Até o dia ' + (cfg.data_limite || "") + ', a empresa deverá informar quanto ao cumprimento da ' +
    'presente Ordem de Serviço para a fiscalização do serviço realizado, com o consequente atestado ' +
    'pelo(a) fiscal de contrato. Conforme especificado abaixo, FAVOR REPASSAR AS DATAS QUE CADA ' +
    'SOLICITAÇÃO FOI ATENDIDA E RETORNAR DADOS A ESTA DIVISÃO:'
  ).setAttributes(st.just);
  body.appendParagraph("").setAttributes(st.normal);

  // ordem dos tipos: usa tipos_ordem se veio, senão a ordem do payload
  var tiposPayload = payload.tipos || [];
  var ordem = cfg.tipos_ordem && cfg.tipos_ordem.length ? cfg.tipos_ordem.slice() : [];
  tiposPayload.forEach(function(t){ if (ordem.indexOf(t.tipo) === -1) ordem.push(t.tipo); });
  var porTipo = {};
  tiposPayload.forEach(function(t){ porTipo[t.tipo] = t.itens || []; });
  var tiposComItens = ordem.filter(function(t){ return porTipo[t] && porTipo[t].length; });

  tiposComItens.forEach(function(tipo, tipoIdx) {
    var itens = porTipo[tipo];
    var corTipo = COR_TIPO[tipo] || COR_TIPO["Outros"];

    body.appendParagraph("").setAttributes(st.normal);
    var pTipo = body.appendParagraph(String(tipo).toUpperCase());
    pTipo.setAttributes(st.esq);
    pTipo.editAsText().setForegroundColor(corTipo.header).setFontSize(11);
    body.appendParagraph("").setAttributes(st.normal);

    var tableData = [["N° de Processo", "Data de Entrada", "Endereço", "Ponto de Referência", "Trabalho a ser realizado", "Data de Execução"]];
    itens.forEach(function(item) {
      var proc = item.processo || "—";
      if (item.pendente) proc += "\n(Pendente da OS anterior)";
      var end = (item.prioridade !== null && item.prioridade !== undefined && item.prioridade !== "")
        ? "⚡ " + item.endereco : item.endereco;
      tableData.push([proc, item.data_entrada || "—", end, item.ponto_ref || "—", item.trabalho || "—", item.data_exec || ""]);
    });

    var tabela = body.appendTable(tableData);
    tabela.setBorderWidth(1);

    var head = tabela.getRow(0);
    for (var c = 0; c < 6; c++) {
      var cel = head.getCell(c);
      cel.setBackgroundColor(corTipo.header);
      cel.getChild(0).asParagraph().editAsText().setForegroundColor("#FFFFFF").setBold(true).setFontSize(9).setFontFamily("Arial");
      cel.setPaddingTop(3).setPaddingBottom(3);
    }
    for (var r = 1; r < tabela.getNumRows(); r++) {
      var it = itens[r - 1];
      var temPrio = it && it.prioridade !== null && it.prioridade !== undefined && it.prioridade !== "";
      var bg = temPrio ? "#FFF9C4" : (it && it.pendente ? "#FFE0B2" : ((r % 2 === 0) ? corTipo.bg : "#FFFFFF"));
      for (var c2 = 0; c2 < 6; c2++) {
        var cel2 = tabela.getRow(r).getCell(c2);
        cel2.setBackgroundColor(bg);
        cel2.getChild(0).asParagraph().editAsText()
          .setFontSize(9).setFontFamily("Arial").setBold(temPrio || (it && it.pendente)).setForegroundColor("#000000");
        cel2.setPaddingTop(2).setPaddingBottom(2);
      }
    }
    // ── Registro fotográfico: TEXTO à esquerda, FOTO à direita ──
    var comFoto = itens.filter(function(it) { return it.foto_ref_url; });
    if (comFoto.length) {
      body.appendParagraph("").setAttributes(st.normal);
      var pReg = body.appendParagraph("REGISTRO FOTOGRÁFICO — " + String(tipo).toUpperCase());
      pReg.setAttributes(st.esq);
      pReg.editAsText().setForegroundColor(corTipo.header).setFontSize(10);

      var fotoTable = body.appendTable();
      fotoTable.setBorderWidth(1);
      comFoto.forEach(function(it) {
        var row = fotoTable.appendTableRow();
        var cTxt = row.appendTableCell();
        var cImg = row.appendTableCell();
        cTxt.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(6).setPaddingRight(6);
        cImg.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(6).setPaddingRight(6);

        // texto (label em negrito + valor)
        var campos = [];
        if (it.processo && it.processo !== "—") campos.push(["Processo", it.processo]);
        campos.push(["Local", it.endereco]);
        if (it.ponto_ref && it.ponto_ref !== "—") campos.push(["Referência", it.ponto_ref]);
        if (it.trabalho && it.trabalho !== "—") campos.push(["Serviço", it.trabalho]);
        for (var ci = 0; ci < campos.length; ci++) {
          var par = (ci === 0) ? cTxt.getChild(0).asParagraph() : cTxt.appendParagraph("");
          par.setAttributes(st.esq);
          par.clear();
          par.appendText(campos[ci][0] + ": ").setBold(true).setFontSize(9).setFontFamily("Arial").setForegroundColor("#000000");
          par.appendText(campos[ci][1]).setBold(false).setFontSize(9).setFontFamily("Arial").setForegroundColor("#000000");
        }

        // foto à direita
        try {
          var blob = UrlFetchApp.fetch(it.foto_ref_url, { muteHttpExceptions: true }).getBlob();
          var pImg = cImg.getChild(0).asParagraph();
          pImg.setAttributes(st.normal); pImg.clear();
          var img = pImg.appendInlineImage(blob);
          var maxW = 250;
          if (img.getWidth() > maxW) {
            var ratio = img.getHeight() / img.getWidth();
            img.setWidth(maxW).setHeight(Math.round(maxW * ratio));
          }
        } catch (imgErr) {
          cImg.getChild(0).asParagraph().setText("(foto indisponível)").setAttributes(st.normal);
        }
      });
      try { fotoTable.setColumnWidth(0, 210); fotoTable.setColumnWidth(1, 280); } catch (e) {}
    }

    body.appendParagraph("").setAttributes(st.normal);
    if (tipoIdx < tiposComItens.length - 1) body.appendPageBreak();
  });

  body.appendParagraph("").setAttributes(st.normal);
  var hoje = new Date();
  body.appendParagraph("Campo Largo, " + hoje.getDate() + " de " + _nomeMes(hoje.getMonth()) + " de " + hoje.getFullYear() + ".").setAttributes(st.just);
  body.appendParagraph("").setAttributes(st.normal);
  body.appendParagraph("").setAttributes(st.normal);
  body.appendParagraph("________________________________").setAttributes(st.assin);
  body.appendParagraph(cfg.responsavel1 || "").setAttributes(st.assin);
  body.appendParagraph(cfg.cargo1 || "").setAttributes(st.cargo);
  body.appendParagraph("").setAttributes(st.normal);
  body.appendParagraph("________________________________").setAttributes(st.assin);
  body.appendParagraph(cfg.responsavel2 || "").setAttributes(st.assin);
  body.appendParagraph(cfg.cargo2 || "").setAttributes(st.cargo);

  doc.saveAndClose();
  // deixa o link acessível a quem tiver a URL
  try { copiaFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { url: doc.getUrl(), docId: copiaFile.getId(), nome: nomeDoc };
}
