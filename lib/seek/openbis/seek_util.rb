module Seek
  module Openbis

    class SeekUtil

      FAKE_FILE_ASSAY_NAME = 'OpenBIS FILES'.freeze

      def createObisStudy(study_params, creator, obis_asset)

        experiment = obis_asset.content

        study_params[:title] ||= "OpenBIS #{experiment.perm_id}"
        study = Study.new(study_params)
        study.contributor = creator

        study.external_asset = obis_asset
        study
      end

      def createObisAssay(assay_params, creator, obis_asset)

        zample = obis_asset.content
        assay_params[:assay_class_id] ||= AssayClass.for_type("experimental").id
        assay_params[:title] ||= "OpenBIS #{zample.perm_id}"
        assay = Assay.new(assay_params)
        assay.contributor = creator

        assay.external_asset = obis_asset
        assay
      end

      def createObisDataFile(obis_asset)

        dataset = obis_asset.content
        openbis_endpoint = obis_asset.seek_service

        df = DataFile.new(projects: [openbis_endpoint.project], title: "OpenBIS #{dataset.perm_id}",
                          license: openbis_endpoint.project.default_license)

        df.policy=openbis_endpoint.policy.deep_copy
        df.external_asset = obis_asset
        df
      end

      def fake_file_assay(study)

        assay = study.assays.where(title: FAKE_FILE_ASSAY_NAME).first
        return assay if assay

        assay_params = { assay_class_id: AssayClass.for_type("experimental").id, title: FAKE_FILE_ASSAY_NAME }
        assay = Assay.new(assay_params)
        assay.contributor = study.contributor
        assay.study = study
        assay.save!
        assay
      end

      def sync_external_asset(obis_asset)

        entity = fetch_current_entity_version(obis_asset)

        errs = []
        errs = follow_dependent(obis_asset, entity) if should_follow_dependent(obis_asset)
        raise errs.join(', ') unless errs.empty?

        obis_asset.content=entity
        obis_asset.save!
      end

      def should_follow_dependent(obis_asset)

        return false unless obis_asset.seek_entity.is_a? Assay
        obis_asset.sync_options[:link_datasets] == '1'
      end

      def fetch_current_entity_version(obis_asset)
        obis_asset.external_type.constantize.new(obis_asset.seek_service, obis_asset.external_id, true)
      end

      def follow_dependent(obis_asset, current_entity)

        puts 'following dependent'
        data_sets_ids = current_entity.dataset_ids || []
        associate_data_sets_ids(obis_asset.seek_entity, data_sets_ids, obis_asset.seek_service)

      end

      def follow_study_dependent(study)

        asset = study.external_asset
        entity = asset.content
        sync_options = asset.sync_options

        issues = []

        issues.concat follow_study_dependent_assays(entity, study, sync_options)

        issues.concat follow_study_dependent_datafiles(entity, study, sync_options)
        issues
      end

      def follow_study_dependent_assays(entity, study, sync_options)

        zamples = extract_requested_assays(entity, sync_options)

        assay_sync = simplify_assay_sync(sync_options)
        associate_zamples_as_assays(study, zamples, assay_sync)

      end

      def simplify_assay_sync(sync_options)
        sync_options = sync_options.clone
        sync_options.delete(:linked_assays)
        sync_options
      end

      def associate_zample_ids_as_assays(study, zamples_ids, sync_options, endpoint)
        return [] if zamples_ids.empty?


        zamples = Seek::Openbis::Zample.new(endpoint).find_by_perm_ids(zamples_ids)
        associate_zamples_as_assays(study, zamples, sync_options)
      end

      def associate_zamples_as_assays(study, zamples, sync_options)

        issues = []

        external_assets = zamples.map { |ds| OpenbisExternalAsset.find_or_create_by_entity(ds) }

        # warn about non assay
        non_assays = external_assets.reject { |es| es.seek_entity.nil? || es.seek_entity.is_a?(Assay) }
        issues.concat non_assays.map { |es| "#{es.external_id} already registered as #{es.seek_entity.class} #{es.seek_entity.id}" }

        existing_assays = external_assets.select { |es| es.seek_entity.is_a? Assay }
                              .map { |es| es.seek_entity }

        # warn about already linked somewhere else
        issues.concat existing_assays.reject { |es| es.study.id == study.id }
                          .map { |es| "#{es.external_asset.external_id} already registered under different Study #{es.study.id}" }

        # only own assays
        existing_assays = existing_assays.select { |es| es.study.id == study.id }

        assay_params = { study_id: study.id }
        contributor = study.contributor

        new_assays = external_assets.select { |es| es.seek_entity.nil? }
                         .map do |es|
          es.sync_options = sync_options.clone
          createObisAssay(assay_params, contributor, es)
        end

        saved = []

        new_assays.each do |df|
          if df.save
            saved << df
          else
            issues.concat df.errors.full_messages()
          end
        end

        assays = existing_assays+saved

        assays.each { |a| issues.concat follow_assay_dependent(a) }

        issues
      end

      def follow_assay_dependent(assay)

        asset = assay.external_asset
        entity = asset.content
        sync_options = asset.sync_options

        issues = []
        issues.concat follow_assay_dependent_datafiles(entity, assay, sync_options)
        issues
      end

      def follow_assay_dependent_datafiles(entity, assay, sync_options)

        data_sets_ids = extract_requested_sets(entity, sync_options)
        associate_data_sets_ids(assay, data_sets_ids, entity.openbis_endpoint)

      end

      def follow_study_dependent_datafiles(entity, study, sync_options)

        data_sets_ids = extract_requested_sets(entity, sync_options)
        return [] if data_sets_ids.empty?

        assay = fake_file_assay(study)
        associate_data_sets_ids(assay, data_sets_ids, entity.openbis_endpoint)
      end

      def associate_data_sets_ids(assay, data_sets_ids, endpoint)
        return [] if data_sets_ids.empty?

        data_sets = Seek::Openbis::Dataset.new(endpoint).find_by_perm_ids(data_sets_ids)
        associate_data_sets(assay, data_sets)
      end

      def associate_data_sets(assay, data_sets)

        issues = []

        external_assets = data_sets.map { |ds| OpenbisExternalAsset.find_or_create_by_entity(ds) }

        # warn about non assay
        non_files = external_assets.reject { |es| es.seek_entity.nil? || es.seek_entity.is_a?(DataFile) }
        issues.concat non_files.map { |es| "#{es.external_id} already registered as #{es.seek_entity.class} #{es.seek_entity.id}" }

        existing_files = external_assets.select { |es| es.seek_entity.is_a? DataFile }
                             .map { |es| es.seek_entity }

        new_files = external_assets.select { |es| es.seek_entity.nil? }
                        .map { |es| createObisDataFile(es) }

        saved = []

        new_files.each do |df|
          if df.save
            saved << df
          else
            issues.concat df.errors.full_messages()
          end
        end

        data_files = existing_files+saved
        data_files.each { |df| assay.associate(df) }

        issues
      end


      def extract_requested_sets(entity, sync_options)
        return entity.dataset_ids if sync_options[:link_datasets] == '1'
        (sync_options[:linked_datasets] || []) & entity.dataset_ids
      end

      def extract_requested_assays(entity, sync_options)

        sample_ids = (sync_options[:link_assays] == '1') ? entity.sample_ids : (sync_options[:linked_assays] || []) & entity.sample_ids
        zamples = Seek::Openbis::Zample.new(entity.openbis_endpoint).find_by_perm_ids(sample_ids)

        zamples = filter_assay_like_zamples(zamples,entity.openbis_endpoint) if (sync_options[:link_assays] == '1')
        zamples
      end

      def filter_assay_like_zamples(zamples, openbis_endpoint)
        types = assay_types(openbis_endpoint).map(&:code)

        zamples
          .select {|s| types.include? s.type_code}
      end

      def assay_types(openbis_endpoint)

        semantic = Seek::Openbis::SemanticAnnotation.new

        semantic.predicateAccessionId = 'is_a'
        semantic.descriptorAccessionId = 'assay'

        Seek::Openbis::EntityType.SampleType(openbis_endpoint).find_by_semantic(semantic)

      end

      def dataset_types(openbis_endpoint)
        Seek::Openbis::EntityType.DataSetType(openbis_endpoint).all
      end

      def study_types(openbis_endpoint)

        study_codes = ['DEFAULT_EXPERIMENT']

        Seek::Openbis::EntityType.ExperimentType(openbis_endpoint).find_by_codes(study_codes)

      end
    end
  end
end