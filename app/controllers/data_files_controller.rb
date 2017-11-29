require 'simple-spreadsheet-extractor'

class DataFilesController < ApplicationController

  include Seek::IndexPager
  include SysMODB::SpreadsheetExtractor
  include MimeTypesHelper
  include ApiHelper

  include Seek::AssetsCommon

  before_filter :find_assets, only: [:index]
  before_filter :find_and_authorize_requested_item, except: [:index, :new, :upload_for_tool, :upload_from_email, :create, :request_resource, :preview, :test_asset_url, :update_annotations_ajax]
  before_filter :find_display_asset, only: [:show, :explore, :download, :matching_models]
  skip_before_filter :verify_authenticity_token, only: [:upload_for_tool, :upload_from_email]
  before_filter :xml_login_only, only: [:upload_for_tool, :upload_from_email]
  before_filter :get_sample_type, only: :extract_samples
  before_filter :check_already_extracted, only: :extract_samples
  before_filter :forbid_new_version_if_samples, :only => :new_version

  # has to come after the other filters
  include Seek::Publishing::PublishingCommon

  include Seek::BreadCrumbs

  include Seek::DataciteDoi

  include Seek::IsaGraphExtensions

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

    name_of_outfile_html = call_ipython(test,params)
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

    if File.exist?(name_of_outfile_html)
      # from https://stackoverflow.com/questions/130948/read-binary-file-as-string-in-ruby
      contents = File.open(name_of_outfile_html, 'rb') { |f| f.read }
      render :body => contents
    else
      render :text => "Processing the notebook for #{test} failed."
    end

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
      comments = params[:revision_comment]

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
          flash[:error] = 'Unable to save new version'
        end
        format.html { redirect_to @data_file }
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
        Mailer.file_uploaded(current_user, Person.find(params[:recipient_id]), @data_file).deliver_now

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
    if params[:data_file].empty? && !params[:datafile].empty?
      params[:data_file] = params[:datafile]
    end

     if params.key?(:content)
        params[:content_blobs] = params[:content]["data"] #Why a string?
     end
      @data_file = DataFile.new(data_file_params.except!(:content))

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
            format.json { render json: @data_file}
          end
        end
      else
        respond_to do |format|
          format.html do
            render action: 'new'
          end
          format.json {render json: "{}" } #fix
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
    @data_file.attributes = data_file_params.except!(:content)

    update_annotations(params[:tag_list], @data_file)
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
        format.html do
          render action: 'edit'
        end
        format.json {} #to be decided
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
        format.xml { render xml: spreadsheet_to_xml(file) }
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

  protected

  # FIXME why limitation to xparams, yparams, zparams?
  # FIXME transfer all
  def call_ipython(test, json_parameters)
    #Rails.logger.debug "xparams: " + xparams.to_s
    #Rails.logger.debug "yparams: " + yparams.to_s
    #Rails.logger.debug "zparams: " + zparams.to_s

    # location of the convert command to be run
    command = Settings.defaults[:nbconvert_path]

    # server script location
    py_dir_in =  Settings.defaults[:python_nb_basedir]
    py_dir_out =  Settings.defaults[:python_nb_tmp]

    Rails.logger.info "nbconvert_path: " + command + "\npy_dir: " + py_dir_in
    # location of the notebook into which parameters will be inserted
    # TODO infer names to show instead of hardcoded

    notebook_spec = false;
    Settings.defaults[:python_nb_notebooks].each do |notebook_test|
      if test == notebook_test["id"]
            notebook_spec = notebook_test;
      end
    end

    Rails.logger.info "Notebook Specification from config file: #{notebook_spec}"

    unless notebook_spec
      Rails.logger.error "ERROR: " + test + " not implemented."
      return
    end

    notebook = py_dir_in + '/' + notebook_spec[:script]



    # location of the notebook with the inserted parameters
    # FIX ME use tempfile for outbook location
    #??? outbook = tmp_dir + '/outbook_' + timestamp + '.ipynb'


    # outbook = py_dir_out + '/outbook.ipynb'
    # https://stackoverflow.com/questions/13787746/creating-a-thread-safe-temporary-file-name
    outbook = Dir::Tmpname.make_tmpname([py_dir_out + '/seek-notebook-base', '.ipynb'], nil)

    # this is where the ipython notebook reads the json from (need path relative to notebook)
    readjson = Dir::Tmpname.make_tmpname(['./seek-notebook-data-json', '.json'], nil)
    # this is where we write the json to (need path relative to app)
    outjson = py_dir_out + "/" + readjson
    # FIXME needs error checking. What happens if file cannot be opened?
    outjsonfile = File.new(outjson,"w")
    outjsonfile.write(JSON.generate(json_parameters))
    outjsonfile.close()



    #
    #  Actual work starts here

    # the outbook needs to be run in order to update the results
    # FIX ME use tempfile for outbook_processed location
    # ??? outbook_processed = tmp_dir + '/outbook_' + timestamp + '.nbconvert.ipynb'
    # FIXME use proper temporary file creation
    # outbook_processed = py_dir_out + '/outbook.nbconvert.ipynb'
    outbook_processed_name = Dir::Tmpname.make_tmpname(['./seek-notebook-processed', '.ipynb'], nil)
    outbook_processed_path = py_dir_out + "/" + outbook_processed_name;
    # Read the notebook from file into a string
    notebook_source = File.read(notebook);
    # parse the notebook
    json_notebook = JSON.parse(notebook_source);
    notebook_source = '' # free the notebook source to save memory

    # Put the input strings as python program into the first cell
    # parameters end up in x and y
    # works now, needs to be generalized

    # cell 0
    cell_code =<<-ENDCELL

import json

seek_f = open('#{readjson}')
# now read the file
seek_f_content = seek_f.read();
seek_f_json = json.loads(seek_f_content);

# print for debugging purposes. Also interesting for the user, so leave in.
print(seek_f_json)
ENDCELL

    Rails.logger.info(cell_code);

    # processing: replace cell as specified in config file
    json_notebook["cells"][notebook_spec[:cell]]["source"]=cell_code;

    # FIXME needs error checking. What happens if file cannot be opened?
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

    #redirect here eventually
    retval = outbook_processed_path.sub(/.ipynb/, '.html')
    Rails.logger.info "Processed: "
    Rails.logger.info retval;
    return retval;
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

  private

  def data_file_params
    params.require(:data_file).permit(:title, :description, :simulation_data, {project_ids: []}, :license, :other_creators,
                                      :parent_name, {event_ids: []},
                                      {special_auth_codes_attributes: [:code, :expiration_date, :id, :_destroy]})
  end

end
