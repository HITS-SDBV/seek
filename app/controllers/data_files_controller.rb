require 'simple-spreadsheet-extractor'

class DataFilesController < ApplicationController

  include Seek::IndexPager
  include SysMODB::SpreadsheetExtractor
  include MimeTypesHelper
  include ApiHelper

  include Seek::AssetsCommon

  before_filter :find_assets, only: [:index]
  before_filter :find_and_authorize_requested_item, except: [:index, :new, :upload_for_tool, :upload_from_email, :create, :create_content_blob,
                                                             :request_resource, :preview, :test_asset_url, :update_annotations_ajax, :rightfield_extraction_ajax, :provide_metadata]
  before_filter :find_display_asset, only: [:show, :explore, :download, :matching_models]
  skip_before_filter :verify_authenticity_token, only: [:upload_for_tool, :upload_from_email]
  before_filter :xml_login_only, only: [:upload_for_tool, :upload_from_email]
  before_filter :get_sample_type, only: :extract_samples
  before_filter :check_already_extracted, only: :extract_samples
  before_filter :forbid_new_version_if_samples, :only => :new_version

  before_filter :oauth_client, only: :retrieve_nels_sample_metadata
  before_filter :nels_oauth_session, only: :retrieve_nels_sample_metadata
  before_filter :rest_client, only: :retrieve_nels_sample_metadata

  before_filter :login_required, only: [:create, :create_content_blob, :create_metadata, :rightfield_extraction_ajax, :provide_metadata]

  # has to come after the other filters
  include Seek::Publishing::PublishingCommon

  include Seek::BreadCrumbs

  include Seek::Doi::Minting

  include Seek::IsaGraphExtensions

  def get_book
    Rails.logger.error "get_book"
    
    key = params['bookKey'];
    f = params['bookFormat'];

    return inner_get_book(key,f);
  end
  
  def pythonize
    # FIXME: Clean up!
    test = params['test']

    # FIXME: why use this location?
    #name_of_outfile = "public/python_nb/outbook.nbconvert.ipynb"
    #name_of_outfile_html = "public/python_nb/outbook.nbconvert.html"
    # delete intermediate files, in case call_ipython fails.
    # TODO: maybe this should be done earlier
    # FIXME: This is really scary programming. There is a file with an undefined lifetime
    # FIXME: Just one per session
    #if File.exist?(name_of_outfile)
    #  puts "deleted #{name_of_outfile_html}"
    #  File.delete(name_of_outfile_html)
    #end
    #if File.exist?(name_of_outfile)
    #  puts "deleted #{name_of_outfile}"
    #  File.delete(name_of_outfile)
    #end
    resultHash = call_ipython(test,params)
    
    name_of_outfile_html = resultHash["htmlBookPath"] 
    # TODO check for success

    # redirect_to html_output
    # TODO redirect to a variable html filename based on a timestamp or tmp-stamp generation.
    # FIXME thats not the way you do it.
    # FIXME read the file and output it
    #redirect_to "/python_nb/outbook.nbconvert.html"
    #Rails.logger.debug "Before reading iPython results"

    #Rails.logger.debug "The content"
    #Rails.logger.debug scontent
    #Rails.logger.debug "/The content"

    unless(session[:jupyterInfo])
      session[:jupyterInfo]={}
    end
    session[:jupyterInfo][resultHash['key']]=resultHash

    html_url = create_notebook_url(resultHash['key'],'html')
    ipynb_url = create_notebook_url(resultHash['key'],'ipynb')
    small_html_url = create_notebook_url(resultHash['key'],'smallHtml')


    # render :text => "This is the content of Jupyter Info: #{session[:jupyterInfo]} #{html_url},#{ipynb_url}"

    #return(inner_get_book(resultHash['key'],'smallHtml'))
    render partial: 'jupyter_result', locals:{
             small_html_url: small_html_url,
             html_url:       html_url,
             ipynb_url:      ipynb_url,
           }
    #, locals: { small_html_url: small_html_url}
  end

  def plot
    sheet = params[:sheet] || 2
    @csv_data = spreadsheet_to_csv(open(@data_file.content_blob.filepath), sheet, true)
    respond_to do |format|
      format.html
    end
  end

  def destroy
    if @data_file.extracted_samples.any? && !params[:destroy_extracted_samples]
      redirect_to destroy_samples_confirm_data_file_path(@data_file)
    else
      if params[:destroy_extracted_samples] == '1'
        @data_file.extracted_samples.destroy_all
      end
      super
    end
  end

  def destroy_samples_confirm
    if @data_file.can_delete?
      respond_to do |format|
        format.html
      end
    end
  end

  def new_version
    if handle_upload_data
      comments = params[:revision_comments]

      respond_to do |format|
        if @data_file.save_as_new_version(comments)
          create_content_blobs

          # Duplicate studied factors
          factors = @data_file.find_version(@data_file.version - 1).studied_factors
          factors.each do |f|
            new_f = f.dup
            new_f.data_file_version = @data_file.version
            new_f.save
          end
          flash[:notice] = "New version uploaded - now on version #{@data_file.version}"
          if @data_file.is_with_sample?
            bio_samples = @data_file.bio_samples_population @data_file.samples.first.institution_id if @data_file.samples.first
            unless bio_samples.errors.blank?
              flash[:notice] << '<br/> However, Sample database population failed.'
              flash[:error] = bio_samples.errors.html_safe
            end
          end
        else
          flash[:error] = 'Unable to save newflash[:error] version'
        end
        format.html { redirect_to @data_file }
        format.json { render json: @data_file}
      end
    else
      flash[:error] = flash.now[:error]
      redirect_to @data_file
    end
  end

  def upload_for_tool
    if handle_upload_data
      params[:data_file][:project_ids] = [params[:data_file].delete(:project_id)] if params[:data_file][:project_id]
      @data_file = DataFile.new(data_file_params)

      @data_file.policy = Policy.new_for_upload_tool(@data_file, params[:recipient_id])

      if @data_file.save
        @data_file.creators = [current_person]
        create_content_blobs
        # send email to the file uploader and receiver
        Mailer.file_uploaded(current_user, Person.find(params[:recipient_id]), @data_file).deliver_later

        flash.now[:notice] = "#{t('data_file')} was successfully uploaded and saved." if flash.now[:notice].nil?
        render text: flash.now[:notice]
      else
        errors = (@data_file.errors.map { |e| e.join(' ') }.join("\n"))
        render text: errors, status: 500
      end
    end
  end

  def upload_from_email
    if current_user.is_admin? && Seek::Config.admin_impersonation_enabled
      User.with_current_user Person.find(params[:sender_id]).user do
        if handle_upload_data
          @data_file = DataFile.new(data_file_params)

          @data_file.policy = Policy.new_from_email(@data_file, params[:recipient_ids], params[:cc_ids])

          if @data_file.save
            @data_file.creators = [User.current_user.person]
            create_content_blobs

            flash.now[:notice] = "#{t('data_file')} was successfully uploaded and saved." if flash.now[:notice].nil?
            render text: flash.now[:notice]
          else
            errors = (@data_file.errors.map { |e| e.join(' ') }.join("\n"))
            render text: errors, status: 500
          end
        end
      end
    else
      render text: 'This user is not permitted to act on behalf of other users', status: :forbidden
    end
  end



  def create
    @data_file = DataFile.new(data_file_params)

    if handle_upload_data
      update_sharing_policies(@data_file)

      if @data_file.save
        update_annotations(params[:tag_list], @data_file)
        update_scales @data_file

        create_content_blobs

        update_relationships(@data_file, params)

        if !@data_file.parent_name.blank?
          render partial: 'assets/back_to_fancy_parent', locals: { child: @data_file, parent_name: @data_file.parent_name, is_not_fancy: true }
        else
          respond_to do |format|
            flash[:notice] = "#{t('data_file')} was successfully uploaded and saved." if flash.now[:notice].nil?
            # parse the data file if it is with sample data
            if @data_file.is_with_sample
              bio_samples = @data_file.bio_samples_population params[:institution_id]

              unless  bio_samples.errors.blank?
                flash[:notice] << '<br/> However, Sample database population failed.'
                flash[:error] = bio_samples.errors.html_safe
              end
            end
            # the assay_id param can also contain the relationship type
            assay_ids, relationship_types = determine_related_assay_ids_and_relationship_types(params)
            update_assay_assets(@data_file, assay_ids, relationship_types)
            format.html { redirect_to data_file_path(@data_file) }
            format.json { render json: @data_file }
          end
        end
      else
        respond_to do |format|
          format.html { render action: 'new' }
          format.json { render json: json_api_errors(@data_file), status: :unprocessable_entity }
        end
      end
    else
      handle_upload_data_failure
    end
  end

  def determine_related_assay_ids_and_relationship_types(params)
    assay_ids = []
    relationship_types = []
    (params[:assay_ids] || []).each do |assay_type_text|
      assay_id, relationship_type = assay_type_text.split(',')
      assay_ids << assay_id
      relationship_types << relationship_type
    end
    [assay_ids, relationship_types]
  end

  def update
    if params[:data_file].empty? && !params[:datafile].empty?
      params[:data_file] = params[:datafile]
    end	
    @data_file.assign_attributes(data_file_params)

    update_annotations(params[:tag_list], @data_file) if params.key?(:tag_list)
    update_scales @data_file

    respond_to do |format|
      update_sharing_policies @data_file

      if @data_file.save
        update_relationships(@data_file, params)

        # the assay_id param can also contain the relationship type
        assay_ids, relationship_types = determine_related_assay_ids_and_relationship_types(params)
        update_assay_assets(@data_file, assay_ids, relationship_types)

        flash[:notice] = "#{t('data_file')} metadata was successfully updated."
        format.html { redirect_to data_file_path(@data_file) }
        format.json {render json: @data_file}
      else
        format.html { render action: 'edit' }
        format.json { render json: json_api_errors(@data_file), status: :unprocessable_entity }
      end
    end
  end

  def data
    @data_file =  DataFile.find(params[:id])
    sheet = params[:sheet] || 1
    trim = params[:trim] || false
    content_blob = @data_file.content_blob
    file = open(content_blob.filepath)
    mime_extensions = mime_extensions(content_blob.content_type)
    if !(%w(xls xlsx) & mime_extensions).empty?
      respond_to do |format|
        format.html # currently complains about a missing template, but we don't want people using this for now - its purely XML
        format.xml { render xml: spreadsheet_to_xml(file, memory_allocation = Seek::Config.jvm_memory_allocation) }
        format.csv { render text: spreadsheet_to_csv(file, sheet, trim) }
      end
    else
      respond_to do |format|
        flash[:error] = 'Unable to view contents of this data file'
        format.html { redirect_to @data_file, format: 'html' }
      end
    end
  end

  def explore
    if @display_data_file.contains_extractable_spreadsheet?
      respond_to do |format|
        format.html
      end
    else
      respond_to do |format|
        flash[:error] = 'Unable to view contents of this data file'
        format.html { redirect_to data_file_path(@data_file, version: @display_data_file.version) }
      end
    end
  end

  def matching_models
    # FIXME: should use the correct version
    @matching_model_items = @data_file.matching_models
    # filter authorization
    ids = @matching_model_items.collect(&:primary_key)
    models = Model.where(id: ids)
    authorised_ids = Model.authorize_asset_collection(models, 'view').collect(&:id)
    @matching_model_items = @matching_model_items.select { |mdf| authorised_ids.include?(mdf.primary_key.to_i) }

    flash.now[:notice] = "#{@matching_model_items.count} #{t('model').pluralize}  were found that may be relevant to this #{t('data_file')} "
    respond_to do |format|
      format.html
    end
  end

  def filter
    scope = DataFile
    scope = scope.joins(:projects).where(projects: { id: current_user.person.projects }) unless (params[:all_projects] == 'true')
    scope = scope.where(simulation_data: true) if (params[:simulation_data] == 'true')
    scope = scope.with_extracted_samples if (params[:with_samples] == 'true')

    @data_files = DataFile.authorize_asset_collection(
      scope.where('data_files.title LIKE ?', "%#{params[:filter]}%").uniq, 'view'
    ).first(20)

    respond_to do |format|
      format.html { render partial: 'data_files/association_preview', collection: @data_files, locals: { hide_sample_count: !params[:with_samples] } }
    end
  end

  def samples_table
    respond_to do |format|
      format.html do
        render(partial: 'samples/table_view', locals: {
                 samples: @data_file.extracted_samples.includes(:sample_type),
                 source_url: samples_table_data_file_path(@data_file)
               })
      end
      format.json { @samples = @data_file.extracted_samples.select([:id, :title, :json_metadata]) }
    end
  end

  def select_sample_type
    @possible_sample_types = @data_file.possible_sample_types

    respond_to do |format|
      format.html
    end
  end

  def extract_samples
    if params[:confirm]
      extractor = Seek::Samples::Extractor.new(@data_file, @sample_type)
      @samples = extractor.persist.select(&:persisted?)
      extractor.clear
      @data_file.copy_assay_associations(@samples, params[:assay_ids]) if params[:assay_ids]
      flash[:notice] = "#{@samples.count} samples extracted successfully"
    else
      SampleDataExtractionJob.new(@data_file, @sample_type, false).queue_job
    end

    respond_to do |format|
      format.html { redirect_to @data_file }
    end
  end

  def confirm_extraction
    @samples, @rejected_samples = Seek::Samples::Extractor.new(@data_file).fetch.partition(&:valid?)
    @sample_type = @samples.first.sample_type if @samples.any?
    @sample_type ||= @rejected_samples.first.sample_type if @rejected_samples.any?

    respond_to do |format|
      format.html
    end
  end

  def cancel_extraction
    Seek::Samples::Extractor.new(@data_file).clear

    respond_to do |format|
      flash[:notice] = 'Sample extraction cancelled'
      format.html { redirect_to @data_file }
    end
  end

  def extraction_status
    @previous_status = params[:previous_status]
    @job_status = SampleDataExtractionJob.get_status(@data_file)

    respond_to do |format|
      format.html { render partial: 'data_files/sample_extraction_status', locals: { data_file: @data_file } }
    end
  end

  def retrieve_nels_sample_metadata
    begin
      if @data_file.content_blob.retrieve_from_nels(@oauth_session.access_token)
        @sample_type = @data_file.reload.possible_sample_types.last

        if @sample_type
          SampleDataExtractionJob.new(@data_file, @sample_type, false, overwrite: true).queue_job

          respond_to do |format|
            format.html { redirect_to @data_file }
          end
        else
          flash[:notice] = 'Successfully downloaded sample metadata from NeLS, but could not find a matching sample type.'

          respond_to do |format|
            format.html { redirect_to @data_file }
          end
        end
      else
        flash[:error] = 'Could not download sample metadata from NeLS.'

        respond_to do |format|
          format.html { redirect_to @data_file }
        end
      end
    rescue RestClient::Unauthorized
      redirect_to @oauth_client.authorize_url
    rescue RestClient::ResourceNotFound
      flash[:error] = 'No sample metadata available.'

      respond_to do |format|
        format.html { redirect_to @data_file }
      end
    end
  end

  ### ACTIONS RELATED TO DATA FILE UPLOAD AND RIGHTFIELD EXTRACTION ###

  # handles the uploading of the file to create a content blob, which is then associated with a new unsaved datafile
  # and stored on the session
  def create_content_blob
    @data_file = DataFile.new
    respond_to do |format|
      if handle_upload_data
        create_content_blobs
        session[:uploaded_content_blob_id] = @data_file.content_blob.id
        # assay ids passed forwards, e.g from "Add Datafile" button
        @source_assay_ids = (params[:assay_ids] || [] ).reject(&:blank?)
        format.html {}
      else
        session.delete(:uploaded_content_blob_id)
        format.html { render action: :new }
      end
    end
  end

  # AJAX call to trigger any RightField extraction (if appropriate), and pre-populates the associated @data_file and
  # @assay
  def rightfield_extraction_ajax

    @data_file = DataFile.new
    @warnings = nil
    @assay = Assay.new
    critical_error_msg = nil
    session.delete :extraction_exception_message

    begin
      if params[:content_blob_id] == session[:uploaded_content_blob_id].to_s
        @data_file.content_blob = ContentBlob.find_by_id(params[:content_blob_id])
        @warnings = @data_file.populate_metadata_from_template
        @assay, warnings = @data_file.initialise_assay_from_template
        @warnings.merge(warnings)
      else
        critical_error_msg = "The file that was requested to be processed doesn't match that which had been uploaded"
      end
    rescue Exception => e
      ExceptionNotifier.notify_exception(e, data: {
          message: "Problem attempting to extract from RightField for content blob #{params[:content_blob_id]}",
          current_logged_in_user: current_user
      })
      session[:extraction_exception_message] = e.message
    end

    session[:processed_datafile] = @data_file
    session[:processed_assay] = @assay
    session[:processing_warnings] = @warnings

    respond_to do |format|
      if critical_error_msg
        format.js { render text: critical_error_msg, status: :unprocessable_entity }
      else
        format.js { render text: 'done', status: :ok }
      end
    end
  end

  # Displays the form Wizard for providing the metadata for both the data file, and possibly related Assay
  # if not already provided and available, it will use those that had previously been populated through RightField extraction
  def provide_metadata
    @data_file ||= session[:processed_datafile]
    @assay ||= session[:processed_assay]
    @warnings ||= session[:processing_warnings] || []
    @exception_message ||= session[:extraction_exception_message]
    @create_new_assay = !(@assay.title.blank? && @assay.description.blank?)
    respond_to do |format|
      format.html {}
    end
  end

  # Receives the submitted metadata and registers the datafile and assay
  def create_metadata
    @data_file = DataFile.new(data_file_params)
    assay_params = data_file_assay_params
    sop_id = assay_params.delete(:sop_id)
    @create_new_assay = assay_params.delete(:create_assay)

    update_sharing_policies(@data_file)

    @assay = Assay.new(assay_params)
    if sop_id
      sop = Sop.find_by_id(sop_id)
      @assay.sops << sop if sop && sop.can_view?
    end
    @assay.policy = @data_file.policy.deep_copy if @create_new_assay

    filter_associated_projects(@data_file)

    # check the content blob id matches that previously uploaded and recorded on the session
    all_valid = uploaded_blob_matches = (params[:content_blob_id].to_s == session[:uploaded_content_blob_id].to_s)

    #associate the content blob with the data file
    blob = ContentBlob.find(params[:content_blob_id])
    @data_file.content_blob = blob

    # if creating a new assay, check it is valid and the associated study is editable
    all_valid = all_valid && !@create_new_assay || (@assay.study.try(:can_edit?) && @assay.save)

    # check the datafile can be saved, and also the content blob can be saved
    all_valid = all_valid && @data_file.save && blob.save

    if all_valid
      update_annotations(params[:tag_list], @data_file)
      update_scales @data_file

      update_relationships(@data_file, params)

      session.delete(:uploaded_content_blob_id)

      respond_to do |format|
        flash[:notice] = "#{t('data_file')} was successfully uploaded and saved." if flash.now[:notice].nil?
        # parse the data file if it is with sample data

        # the assay_id param can also contain the relationship type
        assay_ids, _relationship_types = determine_related_assay_ids_and_relationship_types(params)
        assay_ids = [@assay.id.to_s] if @create_new_assay
        update_assay_assets(@data_file, assay_ids)
        format.html { redirect_to data_file_path(@data_file) }
        format.json { render json: @data_file }
      end

    else
      @data_file.errors[:base] = "The file uploaded doesn't match" unless uploaded_blob_matches

      # this helps trigger the complete validation error messages, as not both may be validated in a single action
      # - want the avoid the user fixing one set of validation only to be presented with a new set
      @assay.valid? if @create_new_assay
      @data_file.valid? if uploaded_blob_matches

      respond_to do |format|
        format.html do
          render :provide_metadata, status: :unprocessable_entity
        end
      end
    end
  end

  protected

  def call_ipython(test, json_parameters)
    # location of the nbconvert command to be run
    command = Settings.defaults[:nbconvert_path]

    # server base script location + output dir
    py_dir_in =  Settings.defaults[:python_nb_basedir]
    py_dir_out =  Settings.defaults[:python_nb_tmp]

    #find the SEEK config of the test to run
    notebook_spec = Settings.defaults[:python_nb_notebooks].detect {|nb| nb["id"] == test }
    if notebook_spec.nil?
      Rails.logger.error "ERROR: test " + test + " not implemented."
      return
    end

    notebook = py_dir_in + '/' + notebook_spec[:script]

    Rails.logger.info "nbconvert_path: " + command + "\npy_dir: " + py_dir_in
    Rails.logger.info "Notebook Specification from config file: #{notebook_spec}"

    # https://stackoverflow.com/questions/13787746/creating-a-thread-safe-temporary-file-name
    outkey = Dir::Tmpname.make_tmpname(['seek-notebook-key',".ign"],nil)
    outbook = Dir::Tmpname.make_tmpname([py_dir_out + '/seek-notebook-base', '.ipynb'], nil)

    # path to json input as needed by the ipython notebook (need path relative to notebook)
    readjson = Dir::Tmpname.make_tmpname(['./seek-notebook-data-json', '.json'], nil)

    # First generate that json input from the params. need path relative to Rails app
    outjson = py_dir_out + "/" + readjson
    session.delete :extraction_exception_message
    begin
      outjsonfile = File.new(outjson,"w")
      outjsonfile.write(JSON.generate(json_parameters))
      outjsonfile.close()
    rescue Exception => e
      ExceptionNotifier.notify_exception(e, data: {
          message: "Jupyter notebooks: Error writing temporary json output:  #{outjsonfile}",
          current_logged_in_user: current_user
      })
      session[:extraction_exception_message] = e.message
    end

    outbook_processed_name = Dir::Tmpname.make_tmpname(['./seek-notebook-processed', '.ipynb'], nil)
    outbook_processed_path = py_dir_out + "/" + outbook_processed_name

    outbook_small_name = Dir::Tmpname.make_tmpname(['./seek-notebook-small', '.ipynb'], nil)
    outbook_small_path = py_dir_out + "/" + outbook_small_name

    #  Actual work starts here
    #
    # Read the notebook from file into a string and parse
    notebook_source = File.read(notebook)
    json_notebook = JSON.parse(notebook_source)
    notebook_source = '' # free the notebook source to save memory

    #FIX ME what if the notebook is changed and JSON_INPUT is not in the first line of :cell?
    json_notebook["cells"][notebook_spec[:cell]]["source"][0]["JSON_INPUT"] = readjson

    Rails.logger.info "Replaced input file in notebook with: " + json_notebook["cells"][notebook_spec[:cell]]["source"]

    # FIXME needs error checking. What happens if file cannot be opened? --> Generalize this
    outfile = File.new(outbook,"w")

    # this writes the modified book
    outfile.write(JSON.generate(json_notebook))
    outfile.close()


    # run scripts:
    # seems to be the safest way to run ruby commands according to WHOM?
    # first run the notebook!
    puts "*** running the notebook: #{command} #{outbook} --to notebook --execute --output=#{outbook_processed_name}"
    Rails.logger.info "Running:  #{command} #{outbook} --to notebook --execute --output=#{outbook_processed_name}"
    result = `#{command} #{outbook} --to notebook --execute --allow-errors --output=#{outbook_processed_name}`

    Rails.logger.info result


    
    # then turn it into HTML
    # One alternative way to do it would be to run the script.
    # however, I do not know how you would get the plot.
    Rails.logger.info "*** converting notebook to HTML:  #{command} #{outbook_processed_path} --to html"

    result = `#{command} #{outbook_processed_path} --to html`

    
    Rails.logger.info result

    # Maybe some fishing inside the notebook in order to isolate the result of the last cell

    select_cell_from_notebook(notebook_spec[:display_cell],outbook_processed_path,outbook_small_path,notebook_spec[:hide_source]);
    result = `#{command} #{outbook_small_path} --to html`
    
    #redirect here eventually
    ipynbBookPath = outbook_processed_path;
    htmlBookPath = outbook_processed_path.sub(/.ipynb/, '.html')
    htmlSmallPath = outbook_small_path.sub(/.ipynb/, '.html')
    Rails.logger.info "Processed: "
    Rails.logger.info htmlBookPath;
    Rails.logger.info htmlSmallPath;
    return {
		"ipynb" => ipynbBookPath,
		"html" =>	 htmlBookPath,
		"smallHtml" =>	 htmlSmallPath,
                "key" => outkey
    };
end

def translate_action(action)
  action = 'download' if action == 'data'
  action = 'view' if ['matching_models'].include?(action)
  super action
end

def xml_login_only
  unless session[:xml_login]
    flash[:error] = 'Only available when logged in via xml'
    redirect_to root_url
  end
end

def get_sample_type
  if params[:sample_type_id] || @data_file.possible_sample_types.count == 1
    if params[:sample_type_id]
      @sample_type = SampleType.includes(:sample_attributes).find(params[:sample_type_id])
    else
      @sample_type = @data_file.possible_sample_types.last
    end
  elsif @data_file.possible_sample_types.count > 1
    # Redirect to sample type selector
    respond_to do |format|
      format.html { redirect_to select_sample_type_data_file_path(@data_file) }
    end
  else
    flash[:error] = "Couldn't determine the sample type of this data"
    respond_to do |format|
      format.html { redirect_to @data_file }
    end
  end
end

def check_already_extracted
  if @data_file.extracted_samples.any?
    flash[:error] = 'Already extracted samples from this data file'
    respond_to do |format|
      format.html { redirect_to @data_file }
    end
  end
end

def forbid_new_version_if_samples
  if @data_file.extracted_samples.any?
    flash[:error] = "Cannot upload a new version if samples have been extracted"
    respond_to do |format|
      format.html { redirect_to @data_file }
    end
  end
end

def create_notebook_url(bookKey,bookFormat)
  return "#{root_url}data_files/2/get_book?bookKey=#{bookKey};bookFormat=#{bookFormat}"
end

def select_cell_from_notebook(cell_list, in_book_file_path, out_book_file_path,without_source)
  Rails.logger.error "Selecting single cell from notebook: "
  Rails.logger.error cell_list
  Rails.logger.error in_book_file_path
  Rails.logger.error out_book_file_path

  notebook_source = File.read(in_book_file_path);
  json_notebook = JSON.parse(notebook_source);

  o = []

  cell_list.each do |i|
    Rails.logger.error i
    Rails.logger.error json_notebook["cells"][i]['source']

    if(without_source>0)
      json_notebook["cells"][i]['source']=[]
      #json_notebook["cells"][i].delete :source
    end

    o = o.push json_notebook["cells"][i]
  end

  json_notebook["cells"]=o

  Rails.logger.error "Result: "
  Rails.logger.error json_notebook["cells"]
  Rails.logger.error "EndResult: "
  
  # FIXME needs error checking. What happens if file cannot be opened?
  outfile = File.new(out_book_file_path,"w")
  
  # this writes the modified book
  outfile.write(JSON.generate(json_notebook))
  outfile.close()
end

def inner_get_book(key,f)
  Rails.logger.error "get_book"
  
  file_path=""
  ct = 'NONE'
  if(f .eql? 'html')
    file_path = session[:jupyterInfo][key]['html']
    ct = 'text/html'
  end
  
  if(f .eql? 'smallHtml')
    file_path = session[:jupyterInfo][key]['smallHtml']
    ct = 'text/html'
  end
    
  if(f .eql? 'ipynb')
    file_path = session[:jupyterInfo][key]['ipynb']
    ct = 'application/json'
  end
  
  Rails.logger.error f
  Rails.logger.error file_path
  Rails.logger.error ct
  
  Rails.logger.error "File Path #{file_path}"
  
  Rails.logger.error create_notebook_url(key,f);
  
  if File.exist?(file_path)
    # from https://stackoverflow.com/questions/130948/read-binary-file-as-string-in-ruby
    contents = File.open(file_path, 'rb') { |fi| fi.read }
    render :body => contents , :content_type => ct
  else
    render :text => "Processing the notebook failed."
  end
end

  private

  def data_file_params
    params.require(:data_file).permit(:title, :description, :simulation_data, {project_ids: []}, :license, :other_creators,
                                      :parent_name, {event_ids: []},
                                      {special_auth_codes_attributes: [:code, :expiration_date, :id, :_destroy]})
  end

  def data_file_assay_params
    params.fetch(:assay,{}).permit(:title, :description, :assay_class_id, :study_id, :sop_id,:assay_type_uri,:technology_type_uri, :create_assay)
  end

  def oauth_client
    @oauth_client = Nels::Oauth2::Client.new(Seek::Config.nels_client_id,
                                             Seek::Config.nels_client_secret,
                                             nels_oauth_callback_url,
                                             "data_file_id:#{params[:id]}")
  end

  def nels_oauth_session
    @oauth_session = current_user.oauth_sessions.where(provider: 'NeLS').first
    redirect_to @oauth_client.authorize_url if !@oauth_session || @oauth_session.expired?
  end

  def rest_client
    client_class = Nels::Rest::Client
    @rest_client = client_class.new(@oauth_session.access_token)
  end
end
