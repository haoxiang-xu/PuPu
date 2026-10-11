/* One schema per rule in `kernel_output.py`, with the real validator's verdict.
 *
 * `output_schema_cases` came first and says of itself that it was frozen
 * against an unpinned working tree — "evidence of agreement on that day, not
 * the paired contract test". Replayed against the pinned installed artifact it
 * does agree, 12/12. It is also twelve cases, and it agreed because it tested
 * the rules it happened to cover: a differential run over every rule in
 * `validate_output_schema` found the mirror accepting 24 of 43 schemas the
 * runtime refuses. All 24 in that direction — an editor built on it would let
 * an author compose a schema that is only refused at save.
 *
 * So the rules are enumerated from the validator rather than from a reading of
 * it, and both verdicts are recorded. The `code` is the runtime's own, because
 * a mirror that refuses the right schema for the wrong stated reason is still
 * telling the author something false about why.
 *
 * The runtime stops at the first problem and the editor does not — it reports
 * everything wrong at once — so a refused case pins *that the code appears*,
 * not that it is the only one.
 *
 * One rule is deliberately absent: `Draft202012Validator.check_schema`. That
 * is a whole JSON Schema implementation and is not mirrored; it is the reason
 * the editor still has to survive a save rejection it did not predict.
 *
 * Captured from the fixed installed `unchain==0.2.0`
 * (`df33867b3737569fa4a5272b6fdd735fa76a6ec92343517d06e278b9c537c178`).
 * Nothing was rebuilt. The depth boundary is probed, not assumed: thirty
 * levels of the nesting shape below is the deepest it takes, thirty-one is
 * `limit_depth`. */

export const CAPTURED_SCHEMA_ADMISSION = Object.freeze(
[
 {
  "label": "$schema at the admitted dialect",
  "doc": {
   "type": "object",
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "properties": {
    "a": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "$schema at another dialect",
  "doc": {
   "type": "object",
   "$schema": "http://json-schema.org/draft-07/schema#"
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$schema"
  ]
 },
 {
  "label": "$schema that is not a string",
  "doc": {
   "type": "object",
   "$schema": 7
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$schema"
  ]
 },
 {
  "label": "$defs that is not an object",
  "doc": {
   "type": "object",
   "$defs": [],
   "properties": {}
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$defs"
  ]
 },
 {
  "label": "$defs holding something that is not a schema",
  "doc": {
   "type": "object",
   "$defs": {
    "A": "nope"
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$defs",
   "A"
  ]
 },
 {
  "label": "$ref that is not a string",
  "doc": {
   "type": "object",
   "$ref": 7
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$ref"
  ]
 },
 {
  "label": "$ref to a definition that is absent",
  "doc": {
   "type": "object",
   "$ref": "#/$defs/Missing"
  },
  "accepted": false,
  "code": "invalid_reference",
  "path": [
   "schema",
   "$ref"
  ]
 },
 {
  "label": "$ref that is percent-encoded",
  "doc": {
   "type": "object",
   "$ref": "#/$defs/A%20B",
   "$defs": {
    "A B": {
     "type": "object"
    }
   }
  },
  "accepted": false,
  "code": "unsupported_reference",
  "path": [
   "schema",
   "$ref"
  ]
 },
 {
  "label": "$ref outside $defs",
  "doc": {
   "type": "object",
   "$ref": "#/properties/a",
   "properties": {
    "a": {
     "type": "object"
    }
   }
  },
  "accepted": false,
  "code": "unsupported_reference",
  "path": [
   "schema",
   "$ref"
  ]
 },
 {
  "label": "$ref to the root itself",
  "doc": {
   "type": "object",
   "$ref": "#"
  },
  "accepted": false,
  "code": "unsupported_reference",
  "path": [
   "schema",
   "$ref"
  ]
 },
 {
  "label": "$ref with a ~1 escape",
  "doc": {
   "type": "object",
   "$ref": "#/$defs/a~1b",
   "$defs": {
    "a/b": {
     "type": "object",
     "properties": {
      "x": {
       "type": "string"
      }
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "title that is not a string",
  "doc": {
   "type": "object",
   "title": 7
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "title"
  ]
 },
 {
  "label": "description that is not a string",
  "doc": {
   "type": "object",
   "description": []
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "description"
  ]
 },
 {
  "label": "a nested type given as a list",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": [
      "string",
      "null"
     ]
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a nested type list with a repeat",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": [
      "string",
      "string"
     ]
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "type"
  ]
 },
 {
  "label": "a nested type list that is empty",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": []
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "type"
  ]
 },
 {
  "label": "required naming its properties",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   },
   "required": [
    "a"
   ]
  },
  "accepted": true
 },
 {
  "label": "required that is not an array",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   },
   "required": "a"
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "required"
  ]
 },
 {
  "label": "required holding a non-string",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   },
   "required": [
    7
   ]
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "required"
  ]
 },
 {
  "label": "required with a repeated name",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   },
   "required": [
    "a",
    "a"
   ]
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "required"
  ]
 },
 {
  "label": "additionalProperties as a schema",
  "doc": {
   "type": "object",
   "additionalProperties": {
    "type": "string"
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "additionalProperties"
  ]
 },
 {
  "label": "additionalProperties as false",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   },
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "items on an array property",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "enum that is empty",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "enum": []
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "enum"
  ]
 },
 {
  "label": "enum that is not an array",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "enum": "ab"
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "enum"
  ]
 },
 {
  "label": "enum of scalars",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "enum": [
      "x",
      1,
      null
     ]
    }
   }
  },
  "accepted": true
 },
 {
  "label": "const of null",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "const": null
    }
   }
  },
  "accepted": true
 },
 {
  "label": "minItems that is negative",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "minItems": -1
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "minItems"
  ]
 },
 {
  "label": "minItems that is a float",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "minItems": 1.5
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "minItems"
  ]
 },
 {
  "label": "maxLength that is a string",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "maxLength": "10"
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "maxLength"
  ]
 },
 {
  "label": "minimum that is a float",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "minimum": 0.5
    }
   }
  },
  "accepted": true
 },
 {
  "label": "minimum that is a string",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "minimum": "0"
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "minimum"
  ]
 },
 {
  "label": "anyOf that is empty",
  "doc": {
   "type": "object",
   "anyOf": []
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "anyOf"
  ]
 },
 {
  "label": "anyOf that is not an array",
  "doc": {
   "type": "object",
   "anyOf": {}
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "anyOf"
  ]
 },
 {
  "label": "anyOf of two object alternatives",
  "doc": {
   "type": "object",
   "anyOf": [
    {
     "type": "object",
     "properties": {
      "a": {
       "type": "string"
      }
     }
    },
    {
     "type": "object",
     "properties": {
      "b": {
       "type": "string"
      }
     }
    }
   ]
  },
  "accepted": true
 },
 {
  "label": "a reserved name reached through a root anyOf",
  "doc": {
   "type": "object",
   "anyOf": [
    {
     "type": "object",
     "properties": {
      "message": {
       "type": "string"
      }
     }
    }
   ]
  },
  "accepted": false,
  "code": "reserved_name",
  "path": [
   "schema",
   "properties"
  ]
 },
 {
  "label": "a root with no type at all",
  "doc": {
   "properties": {
    "a": {
     "type": "string"
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "type"
  ]
 },
 {
  "label": "a root type given as a list holding object",
  "doc": {
   "type": [
    "object"
   ],
   "properties": {}
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "type"
  ]
 },
 {
  "label": "properties that is not an object",
  "doc": {
   "type": "object",
   "properties": []
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties"
  ]
 },
 {
  "label": "a property whose schema is not an object",
  "doc": {
   "type": "object",
   "properties": {
    "a": 7
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a"
  ]
 },
 {
  "label": "a property named with the empty string",
  "doc": {
   "type": "object",
   "properties": {
    "": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "minLength on a nested string",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "minLength": 0,
     "maxLength": 5
    }
   }
  },
  "accepted": true
 },
 {
  "label": "nesting at the deepest the runtime takes",
  "doc": {
   "type": "object",
   "properties": {
    "n": {
     "type": "object",
     "properties": {
      "n": {
       "type": "object",
       "properties": {
        "n": {
         "type": "object",
         "properties": {
          "n": {
           "type": "object",
           "properties": {
            "n": {
             "type": "object",
             "properties": {
              "n": {
               "type": "object",
               "properties": {
                "n": {
                 "type": "object",
                 "properties": {
                  "n": {
                   "type": "object",
                   "properties": {
                    "n": {
                     "type": "object",
                     "properties": {
                      "n": {
                       "type": "object",
                       "properties": {
                        "n": {
                         "type": "object",
                         "properties": {
                          "n": {
                           "type": "object",
                           "properties": {
                            "n": {
                             "type": "object",
                             "properties": {
                              "n": {
                               "type": "object",
                               "properties": {
                                "n": {
                                 "type": "object",
                                 "properties": {
                                  "n": {
                                   "type": "object",
                                   "properties": {
                                    "n": {
                                     "type": "object",
                                     "properties": {
                                      "n": {
                                       "type": "object",
                                       "properties": {
                                        "n": {
                                         "type": "object",
                                         "properties": {
                                          "n": {
                                           "type": "object",
                                           "properties": {
                                            "n": {
                                             "type": "object",
                                             "properties": {
                                              "n": {
                                               "type": "object",
                                               "properties": {
                                                "n": {
                                                 "type": "object",
                                                 "properties": {
                                                  "n": {
                                                   "type": "object",
                                                   "properties": {
                                                    "n": {
                                                     "type": "object",
                                                     "properties": {
                                                      "n": {
                                                       "type": "object",
                                                       "properties": {
                                                        "n": {
                                                         "type": "object",
                                                         "properties": {
                                                          "n": {
                                                           "type": "object",
                                                           "properties": {
                                                            "n": {
                                                             "type": "object",
                                                             "properties": {
                                                              "n": {
                                                               "type": "object",
                                                               "properties": {
                                                                "n": {
                                                                 "type": "string"
                                                                }
                                                               }
                                                              }
                                                             }
                                                            }
                                                           }
                                                          }
                                                         }
                                                        }
                                                       }
                                                      }
                                                     }
                                                    }
                                                   }
                                                  }
                                                 }
                                                }
                                               }
                                              }
                                             }
                                            }
                                           }
                                          }
                                         }
                                        }
                                       }
                                      }
                                     }
                                    }
                                   }
                                  }
                                 }
                                }
                               }
                              }
                             }
                            }
                           }
                          }
                         }
                        }
                       }
                      }
                     }
                    }
                   }
                  }
                 }
                }
               }
              }
             }
            }
           }
          }
         }
        }
       }
      }
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "nesting one step past it",
  "doc": {
   "type": "object",
   "properties": {
    "n": {
     "type": "object",
     "properties": {
      "n": {
       "type": "object",
       "properties": {
        "n": {
         "type": "object",
         "properties": {
          "n": {
           "type": "object",
           "properties": {
            "n": {
             "type": "object",
             "properties": {
              "n": {
               "type": "object",
               "properties": {
                "n": {
                 "type": "object",
                 "properties": {
                  "n": {
                   "type": "object",
                   "properties": {
                    "n": {
                     "type": "object",
                     "properties": {
                      "n": {
                       "type": "object",
                       "properties": {
                        "n": {
                         "type": "object",
                         "properties": {
                          "n": {
                           "type": "object",
                           "properties": {
                            "n": {
                             "type": "object",
                             "properties": {
                              "n": {
                               "type": "object",
                               "properties": {
                                "n": {
                                 "type": "object",
                                 "properties": {
                                  "n": {
                                   "type": "object",
                                   "properties": {
                                    "n": {
                                     "type": "object",
                                     "properties": {
                                      "n": {
                                       "type": "object",
                                       "properties": {
                                        "n": {
                                         "type": "object",
                                         "properties": {
                                          "n": {
                                           "type": "object",
                                           "properties": {
                                            "n": {
                                             "type": "object",
                                             "properties": {
                                              "n": {
                                               "type": "object",
                                               "properties": {
                                                "n": {
                                                 "type": "object",
                                                 "properties": {
                                                  "n": {
                                                   "type": "object",
                                                   "properties": {
                                                    "n": {
                                                     "type": "object",
                                                     "properties": {
                                                      "n": {
                                                       "type": "object",
                                                       "properties": {
                                                        "n": {
                                                         "type": "object",
                                                         "properties": {
                                                          "n": {
                                                           "type": "object",
                                                           "properties": {
                                                            "n": {
                                                             "type": "object",
                                                             "properties": {
                                                              "n": {
                                                               "type": "object",
                                                               "properties": {
                                                                "n": {
                                                                 "type": "object",
                                                                 "properties": {
                                                                  "n": {
                                                                   "type": "string"
                                                                  }
                                                                 }
                                                                }
                                                               }
                                                              }
                                                             }
                                                            }
                                                           }
                                                          }
                                                         }
                                                        }
                                                       }
                                                      }
                                                     }
                                                    }
                                                   }
                                                  }
                                                 }
                                                }
                                               }
                                              }
                                             }
                                            }
                                           }
                                          }
                                         }
                                        }
                                       }
                                      }
                                     }
                                    }
                                   }
                                  }
                                 }
                                }
                               }
                              }
                             }
                            }
                           }
                          }
                         }
                        }
                       }
                      }
                     }
                    }
                   }
                  }
                 }
                }
               }
              }
             }
            }
           }
          }
         }
        }
       }
      }
     }
    }
   }
  },
  "accepted": false,
  "code": "limit_depth",
  "path": [
   "schema",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "type"
  ]
 },
 {
  "label": "a keyword outside the allowed subset",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "pattern": "^x$"
    }
   }
  },
  "accepted": false,
  "code": "unknown_keyword",
  "path": [
   "schema",
   "properties",
   "a",
   "pattern"
  ]
 },
 {
  "label": "a root property named message",
  "doc": {
   "type": "object",
   "properties": {
    "message": {
     "type": "string"
    }
   }
  },
  "accepted": false,
  "code": "reserved_name",
  "path": [
   "schema",
   "properties"
  ]
 },
 {
  "label": "a node that is not an object under items",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": 7
    }
   }
  },
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "items"
  ]
 }
]
,);
