(function bootstrapPreSavedRoutines(global) {
  const step = (hapi, simboli, teksti_shkurter) => ({ hapi, simboli, teksti_shkurter });
  const card = (fjala, meaning, visual = meaning) => ({ fjala, kuptimi_ne_anglisht: meaning, pershkrimi_vizual_anglisht: visual });
  const option = (fjala, meaning, visual = meaning) => ({ fjala, simboli: "", kuptimi_ne_anglisht: meaning, pershkrimi_vizual_anglisht: visual });
  const routines = {
    "laj duart": {
      sequences: { moduli_i_zgjedhur: "Moduli 1: Sekuencat me Fjalë", sekuencat_me_fjale: { hapat: [step(1,"🚪","Unë shkoj në banjë."),step(2,"🚰","Unë hap rubinetin."),step(3,"💧","Unë lag duart me ujë."),step(4,"🧼","Unë marr sapunin."),step(5,"🫧","Unë fërkoj duart me sapun."),step(6,"💦","Unë shpëlaj duart me ujë."),step(7,"🚰","Unë mbyll rubinetin."),step(8,"🧻","Unë thaj duart me peshqir.")] } },
      flashcards: { moduli_i_zgjedhur: "Moduli 2: Flashcards", flashcards: [card("duart","hands"),card("sapuni","bar of hand soap"),card("uji","clean running water"),card("rubineti","bathroom faucet"),card("lavamani","bathroom sink"),card("fërkoj","child rubbing soapy hands"),card("shpëlaj","child rinsing hands"),card("peshqiri","hand towel")] },
      communication: { moduli_i_zgjedhur: "Moduli 3: Tabela e Komunikimit", tabela_komunikimit: { kategorite: [
        { emri_kategorise:"Veprimet", opsionet:[option("shkoj","go","child walking to bathroom"),option("hap","open","hand turning faucet on"),option("lag","wet","hands under water"),option("marr","take","child taking soap"),option("laj","wash","child washing hands"),option("fërkoj","rub","rubbing soapy hands"),option("shpëlaj","rinse","rinsing hands"),option("mbyll","close","hand turning faucet off"),option("thaj","dry","drying hands with towel")] },
        { emri_kategorise:"Objektet", opsionet:[option("duart","hands"),option("sapunin","hand soap"),option("ujin","water"),option("rubinetin","faucet"),option("lavamanin","sink"),option("peshqirin","hand towel"),option("banjën","bathroom")] },
        { emri_kategorise:"Përemrat", opsionet:[option("unë","I","child pointing to self"),option("ti","you","child pointing to another child")] },
        { emri_kategorise:"Fjalë Lidhëse/Parafjalë", opsionet:[option("në","in"),option("te","at"),option("me","with"),option("nga","from"),option("dhe","and"),option("pastaj","then")] },
        { emri_kategorise:"Ndajfoljet", opsionet:[option("tani","now"),option("ngadalë","slowly"),option("mirë","well")] }
      ] } }
    },
    "laj dhëmbët": {
      sequences: { moduli_i_zgjedhur:"Moduli 1: Sekuencat me Fjalë", sekuencat_me_fjale:{ hapat:[step(1,"🚪","Unë shkoj në banjë."),step(2,"🪥","Unë marr furçën."),step(3,"🧴","Unë marr pastën."),step(4,"🪥","Unë vendos pastë në furçë."),step(5,"😁","Unë fërkoj dhëmbët."),step(6,"💧","Unë shpëlaj gojën me ujë."),step(7,"🚰","Unë mbyll rubinetin."),step(8,"✨","Dhëmbët e mi janë të pastër.")] } },
      flashcards: { moduli_i_zgjedhur:"Moduli 2: Flashcards", flashcards:[card("furça","toothbrush"),card("pasta","toothpaste in a tube; never food"),card("dhëmbët","teeth"),card("goja","mouth"),card("uji","water"),card("rubineti","faucet"),card("fërkoj","child brushing teeth"),card("dhëmbët e pastër","clean healthy teeth")] }
    }
  };
  const normalize = (value) => String(value || "").toLocaleLowerCase("sq-AL").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9çë ]/g, " ").replace(/\s+/g, " ").trim();
  function topicKey(topic) {
    const value = normalize(topic);
    if ((value.includes("duar") || value.includes("duart")) && (value.includes("laj") || value.includes("lar"))) return "laj duart";
    if ((value.includes("dhemb") || value.includes("dhëmb")) && (value.includes("laj") || value.includes("lar"))) return "laj dhëmbët";
    return value;
  }
  function get(moduleType, topic) {
    const value = routines[topicKey(topic)]?.[moduleType];
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }
  global.AtlasPreSavedRoutines = Object.freeze({ get, topicKey });
})(window);
