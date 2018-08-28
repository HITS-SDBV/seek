module Seek
  module Templates
    module Extract
      # Responsible for handling the CSV generated by RightField, for RightField templates, and allowing access to values
      # or resource URI's based upon a cells property URI
      class RightfieldCSVParser
        attr_reader :csv

        TEXT_INDEX = 0
        ENTITY_URI_INDEX = 7
        RESOURCE_URI_INDEX = 5

        def initialize(csv_text)
          @csv = CSV.parse(csv_text)
        end

        def value_for_property_and_index(property, type, index)
          values_for_property(property, type)[index]
        end

        def values_for_property(property, type)
          values_for_entity_uri(Seek::Rdf::JERMVocab[property], type)
        end

        def contains_rightfield_elements?
          @csv.reject { |row| row[7] == 'None' }.count > 1
        end

        private

        def values_for_entity_uri(uri, type)
          rows = @csv.each.select { |row| row[ENTITY_URI_INDEX] == uri }
          index = index_for_value_type(type)
          rows.collect { |row| row[index] }
        end

        def index_for_value_type(type)
          case type
          when :literal
            TEXT_INDEX
          when :term_uri
            RESOURCE_URI_INDEX
          else
            raise "Unrecognised type #{type}"
          end
        end
      end
    end
  end
end
