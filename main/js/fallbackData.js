(function loadAtlasFallbackData(global) {
  global.AtlasFallbackData = Object.freeze({
    planSummary: {
      strengths: ["Ndjek rutinat vizuale", "Mëson mirë me hapa të vegjël", "Përgjigjet ndaj përforcimit pozitiv"],
      challenges: ["Ka nevojë për udhëzime të shkurtra", "Përfiton nga tranzicionet e paralajmëruara"],
      objectives: ["Të kërkojë ndihmë", "Të ndjekë një rutinë me hapa", "Të shprehë një zgjedhje"]
    },
    modules: {
      "Moduli 1: Sekuencat me Fjalë": {
        moduli_i_zgjedhur: "Moduli 1: Sekuencat me Fjalë",
        sekuencat_me_fjale: { hapat: [["🚻", "Unë shkoj në banjë."], ["🚰", "Unë hap rubinetin."], ["💧", "Unë lag duart me ujë."], ["🧼", "Unë marr sapunin."], ["👏", "Unë fërkoj duart me sapun."], ["💦", "Unë shpëlaj duart me ujë."], ["🚱", "Unë mbyll rubinetin."], ["🧻", "Unë thaj duart me peshqir."]].map(([simboli, teksti_shkurter], index) => ({ hapi: index + 1, simboli, teksti_shkurter })) }
      },
      "Moduli 2: Flashcards": {
        moduli_i_zgjedhur: "Moduli 2: Flashcards",
        flashcards: [["duart e papastra", "dirty hands"], ["sapuni", "hand soap"], ["uji", "clean running water"], ["rubineti", "water faucet"], ["fërkoj", "rubbing hands with soap"], ["shpëlaj", "rinsing hands with water"], ["peshqiri", "clean hand towel"], ["duart e pastra", "clean hands"]].map(([fjala, meaning]) => ({ fjala, kuptimi_ne_anglisht: meaning, pershkrimi_vizual_anglisht: `a simple child-friendly AAC symbol showing ${meaning}` }))
      },
      "Moduli 3: Tabela e Komunikimit": {
        moduli_i_zgjedhur: "Moduli 3: Tabela e Komunikimit",
        tabela_komunikimit: { kategorite: [
          ["Veprimet", ["shkoj", "hap", "lag", "marr", "fërkoj", "shpëlaj", "mbyll", "thaj"]],
          ["Objektet", ["duart", "sapunin", "ujin", "rubinetin", "lavamanin", "peshqirin", "banjën"]],
          ["Përemrat", ["unë", "ti"]],
          ["Fjalë Lidhëse/Parafjalë", ["në", "te", "me", "nga", "dhe", "pastaj", "për"]],
          ["Ndajfoljet", ["tani", "ngadalë", "mirë", "përsëri"]]
        ].map(([emri_kategorise, words]) => ({ emri_kategorise, opsionet: words.map((fjala) => ({ fjala, simboli: "", kuptimi_ne_anglisht: fjala, pershkrimi_vizual_anglisht: `simple AAC symbol for ${fjala}` })) })) }
      },
      "Moduli 4: Social Story (Libri Virtual)": {
        moduli_i_zgjedhur: "Moduli 4: Social Story (Libri Virtual)",
        social_story_libri: {
          titulli_tregimit: "Unë laj duart",
          faqet: ["Unë shkoj në banjë.", "Unë afrohem te lavamani.", "Unë hap rubinetin.", "Unë lag duart me ujë.", "Unë marr sapunin.", "Unë fërkoj mirë duart.", "Unë shpëlaj duart me ujë.", "Unë mbyll rubinetin.", "Unë thaj duart me peshqir.", "Unë buzëqesh me duar të pastra."].map((teksti_faqes, index) => ({ numri_faqes: index + 1, teksti_faqes }))
        }
      }
    }
  });
})(window);
